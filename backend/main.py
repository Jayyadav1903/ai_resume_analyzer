import os
import shutil
import json
import jwt
import fitz
from docx import Document
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Local Imports (Ensure these files exist in your folder!)
from database import engine, User, AnalysisJob
from security import get_password_hash, verify_password, create_access_token
from worker import process_resume_task

load_dotenv()

# --- SETUP ---
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
UPLOAD_DIR = "uploaded_resumes"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()

# --- RATE LIMITING ---
REDIS_URL = os.getenv("REDIS_URL")

limiter = Limiter(key_func=get_remote_address, storage_uri=REDIS_URL)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded,_rate_limit_exceeded_handler)

# --- CORS ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://ai-resume-analyzer-seven-psi.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS & AUTH ---
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    class Config:
        from_attributes = True

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=["HS256"])
        email: str = payload.get("sub")
        if email is None: raise HTTPException(status_code=401)
    except:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(User).filter(User.email == email).first()
    if user is None: raise HTTPException(status_code=401)
    return user

# --- HELPERS ---
def extract_text_from_pdf(file_path):
    text = ""
    with fitz.open(file_path) as doc:
        for page in doc: text += page.get_text()
    return text

def extract_text_from_docx(file_path):
    doc = Document(file_path)
    return "\n".join([para.text for para in doc.paragraphs])

# --- ROUTES ---

@app.post("/api/v1/auth/signup", response_model=UserResponse)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email exists")
    new_user = User(name=user.name, email=user.email, hashed_password=get_password_hash(user.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/v1/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect credentials")
    token = create_access_token(data={"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}

ALLOWED_EXTENSIONS = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"}
MAX_FILE_SIZE_MB = 5
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

@app.post("/api/v1/analyze/")
@limiter.limit("5/minute")
async def analyze_resume(
    request: Request,
    file: UploadFile = File(...),
    job_description: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    
    """
    Step 1 of the Async Flow:
    Accept the file, extract the text, create a pending job in the DB, 
    hand it off to Celery, and respond to the user immediately.
    """
    # --- Phase 3 File Validation (The Bouncer) ---
    #1. Validate File Type
    if file.content_type not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code = 400,
            detail="Invalid file type. Only PDF, DOCX, and TXT are allowed."
        )
        
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size is {MAX_FILE_SIZE_MB} MB."
        )    
    
    # 3. Rewind the file pointer! 
    # Because we read the file to check its size, we have to reset it so `shutil.copyfileobj` works.
    await file.seek(0)
    # ---------------------------------------------------
    
    # 1. Save File
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Extract Text
    text = extract_text_from_pdf(file_path) if file.filename.endswith('.pdf') else extract_text_from_docx(file_path)
    
    
    # 3. Create a pending Job in the Database
    new_job = AnalysisJob(user_id=current_user.id,status="pending")
    
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    
    #4 Trigger the Background Worker
    # .delay() sends the task to Redis/Celery without blocking the API
    process_resume_task.delay(new_job.id, text, job_description)
    
    #5 Return immediately! No more waiting for the AI to respond before we reply to the user.
    return {
        "job_id": new_job.id,
        "message": "Analysis queued. Polling required to get results."
    }

@app.get("/api/v1/job/{job_id}")
@limiter.limit("30/minute")
def get_job_status(
    request: Request,
    job_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # Notice we removed the user_id == current_user.id check temporarily
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found in database")
        
    return {
        "job_id": job.id,
        "status": job.status,
        "result": job.result
    }
        
    