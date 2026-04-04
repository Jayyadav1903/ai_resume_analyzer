import os
import time
import logging
import json
import hashlib
import redis
import ssl
from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure
from datetime import datetime, timezone
from google import genai
from google.genai import types
from database import SessionLocal, AnalysisJob
from dotenv import load_dotenv
from rag import find_relevant_resume_sections

load_dotenv()

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s | %(levelname)s | %(message)s'
                    )
logger = logging.getLogger("working_monitor")

# 1. Initialize Celery (Connecting it to Redis)
redis_url = os.getenv("REDIS_URL")

celery_app = Celery("worker", broker=redis_url, backend=redis_url)


if redis_url.startswith("rediss://"):
    celery_app.conf.update(
        broker_use_ssl={'ssl_cert_reqs': ssl.CERT_NONE},
        redis_backend_use_ssl={'ssl_cert_reqs': ssl.CERT_NONE}
    )

redis_client = redis.from_url(redis_url, decode_responses=True)


task_metrics = {}
            
@task_prerun.connect
def task_started(task_id, task, *args, **kwargs):
    job_id = kwargs.get('job_id') or (args[0] if args else "unknown")
    task_metrics[task_id] = {'start_time' : time.time(), 'job_id' : job_id}
    logger.info(f"STARTING | Task : {task_id} | Job DB ID : {job_id}")             

@task_postrun.connect                 
def task_finished(task_id, task, args, retval, state,  **kwargs):
    if task_id in task_metrics:
        duration = time.time() - task_metrics[task_id]['start_time']
        job_id = kwargs.get('job_id') or (args[0] if args else "unknown")
        logger.info(f"COMPLETED | Task: {task_id} | Job DB ID: {job_id} | State: {state} | Duration: {duration:.2f}s ")                 
        del task_metrics[task_id]
        
@task_failure.connect
def task_failed(task_id, exception, args,traceback, **kwargs):
    job_id = args[0] if args else "unknown"
    logger.error(f"FAILED | Task: {task_id} | Job DB ID: {job_id} | Error: {str(exception)} ")  
    if task_id in task_metrics:
        del task_metrics[task_id]      

#2. Define the Background Task with Failure Handling 
# bind=True allows us to use self.retry
@celery_app.task(bind=True, max_retries=3,default_retry_delay=60)
def process_resume_task(self,job_id:int, extracted_text: str, job_description: str):
    db = SessionLocal()
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    
    if not job:
        db.close()
        return "Job not found"
    
    try:
        # Update status to processing
        job.status = "processing"
        db.commit()
        
        if not job_description or job_description.strip():
            job_description = "No specific job description provided. Analyze the resume as a general candidate profile."
        
        # --- Redis Caching Logic ---
        #1. Create a unique cache key based on the resume text and job description
        content_hash = hashlib.md5(f"{extracted_text}{job_description}".encode('utf-8')).hexdigest() 
        cache_key = f"resume_analysis:{content_hash}"
        
        #2. Check if we have cached results for this content
        cached_result = redis_client.get(cache_key) 
        
        if cached_result:
            print("⚡Cache HIT! Returning cached results.")
            ai_data = json.loads(cached_result)
        
        else:        
            print("⚡Cache MISS! Sending request to Gemini.")
            focused_resume_text = find_relevant_resume_sections(extracted_text, job_description)
            
            client = genai.Client()
            prompt = f"""
            Analyze this highly relevant resume experience: {focused_resume_text}. 
            Job Description: {job_description}. 
            Return JSON: score (0-100), skills (list), missing_skills (list), suggestions (list).
            """
            print("🧠 Sending focused text to Gemini...")
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2)
            )
            
            ai_data = json.loads(response.text)
            redis_client.set(cache_key, json.dumps(ai_data), ex=86400)
            
        #Save to PostgreSQL and mark completed    
        job.result = ai_data
        job.status = "completed"
        db.commit()
        
        return f"Job {job_id} completed successfully!"
    
    except Exception as e:
        print(f"Task Failed: {e} ")
        db.rollback() # Rollback any changes to avoid partial updates
        
        #If we hit a Quota Error (429) 0r timeout, retry the task!
        if "429" in str(e) or "quota" in str(e).lower():
            try:
                self.retry(exc=e)
            except self.MaxRetriesExceededError:
                job.status = "failed"
                job.result = {"error": "AI Quota exhausted after multiple retries."}   
                db.commit()
        else:
            job.status = "failed"
            job.result = {"error": "An internal error occurred during analysis."}
            db.commit()   
            
    finally:
        db.close()            
