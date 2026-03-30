from email.mime import text
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, status, BackgroundTasks, Request
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from security import get_password_hash, verify_password, create_access_token, SECRET_KEY, ALGORITHM
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel,EmailStr, Field
from database import engine, User, ResumeAnalysis
from docx import Document
from slowapi  import Limiter,_rate_limit_exceeded_handler
from slowapi.util import get_remote_address

import shutil
import fitz
import json
import jwt
from google import genai
from google.genai import types

# Load the secret key from the .env file
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"

if not SECRET_KEY:
    # This will show up in your Render logs if the key is missing!
    print("❌ ERROR: SECRET_KEY not found in environment variables!")

# --- 1. DATABASE SETUP ---
# This creates a "factory" for database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# This function safely opens and closes the database connection for each request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

#Create a folder to store the resumes if it doesn't exist yet
UPLOAD_DIR = "uploaded_resumes"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# Initialize the FastAPI app
app = FastAPI()

#1. URLs that are allowed to interact with this API
origins = [
    "http://localhost:5173",    # Standard Vite/React port
    "http://127.0.0.1:5173",    # Alternative local IP
    "https://ai-resume-analyzer-seven-psi.vercel.app", # Your production frontend
]
#2. Add the CORS middleware to your FastAPI app
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,            # Use the list above
    allow_credentials=True,           # Required for cookies/auth headers
    allow_methods=["*"],              # Allow GET, POST, OPTIONS, etc.
    allow_headers=["*"],              # Allow all headers (Content-Type, Authorization)
    expose_headers=["*"],             # Expose all headers to the frontend (optional, but can be useful for debugging)
)
 
# --- DATA VALIDATION ---
# This tells FastAPI exactly what data to expect from React when creating a user
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8, description="Password must be at least 8 characters long")
    
class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr

    class Config:
        from_attributes = True  # (new FastAPI way, replaces orm_mode)    

# Tells FastAPI where to get the token from
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# This is our "Bouncer" function
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
     credentials_exception = HTTPException(
         status_code=status.HTTP_401_UNAUTHORIZED,
         detail="Could not validate credentials",
         headers={"WWW-Authenticate": "Bearer"},
    )
     try:
            # Decode the VIP wristband
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email: str = payload.get("sub")
            if email is None:
                raise credentials_exception
     except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired. Please log in again.")
     except jwt.InvalidTokenError:
            raise credentials_exception
                
        #Find user in the Database
     user = db.query(User).filter(User.email == email).first()
     if user is None:     
         raise credentials_exception
     return user
 
def extract_text_from_pdf(file_path) -> str:
    text = ""
    try:
        with fitz.open(file_path) as doc:
            for page in doc:
                text += page.get_text()
        return text
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return ""        
     
     
def extract_text_from_docx(file_path) -> str:
    try :
        doc = Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])
    except Exception as e:
        print(f"Error reading DOCX: {e}")
        return ""    
 
 
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(429,_rate_limit_exceeded_handler)
     
def run_ai_analysis(analysis_id: int, extracted_text:str, job_description: str):
    db = SessionLocal()
    try:
        client = genai.Client()
        if job_description.strip():
                prompt = f"""
                You are an expert ATS. Compare the following resume against the provided Job Description.
                Return ONLY valid JSON in this exact format:
                {{
                  "score": number (0-100, representing the Match Percentage between the resume and JD),
                  "skills": ["skill1", "skill2"] (key skills found in the resume that MATCH the JD),
                  "missing_skills": ["skill1", "skill2"] (crucial skills required by the JD that are MISSING from the resume),
                  "suggestions": ["suggestion1", "suggestion2"] (actionable tips to tailor the resume for this specific job)
                }}
                Job Description:
                {job_description}
                Resume:
                {extracted_text}
                """
                
        else:
                #Standard Prompt  
                prompt = f"""
                Analyze the following resume.
                Return ONLY valid JSON in this exact format:
                {{
                "score": number (0-100),
                "skills": ["skill1", "skill2"],
                "missing_skills": ["skill1", "skill2"],
                "suggestions": ["suggestion1", "suggestion2"]
                }}
                Resume:
                {extracted_text}
                """
        response = client.models.generate_content(model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
                )
            
        ai_analysis = json.loads(response.text)
        
        analysis = db.query(ResumeAnalysis).filter(ResumeAnalysis.id == analysis_id).first()
        
        if analysis:
            analysis.score = ai_analysis.get("score",0)
            analysis.skills = ai_analysis.get("skills",[])
            analysis.missing_skills = ai_analysis.get("missing_skills",[])
            analysis.suggestions = ai_analysis.get("suggestions", [])
            db.commit()
    except Exception as e:
        print(f"Error: {e}")
        analysis = db.query(ResumeAnalysis).filter(ResumeAnalysis.id == analysis_id).first()
        if analysis:
            analysis.status = "failed" # <--- Handle errors gracefully
            db.commit()
    finally:
        db.close()    
                
     
# Create a basic GET route
@app.get("/")
def read_root():
    return {"message":"Welcome to the AI Resume Analyzer API!"}

@app.get("/api/health")
def health_check():
    return {"status":"ok","message":"Backend is running smoothly."}

@app.post("/api/v1/auth/signup", response_model=UserResponse)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    # 1. Check if user already exists
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # 2. Hash the password
    hashed_pw = get_password_hash(user.password)
    
    # 3.Save to database
    new_user = User(name=user.name, email=user.email, hashed_password=hashed_pw)
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user 

@app.post("/api/v1/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. Find the user by email (OAuth2 uses 'username' for the email field by default)
    user = db.query(User).filter(User.email == form_data.username).first()
    
    # 2. Verify the user exists AND the password matches
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # 3. Generate JWT   
    access_token = create_access_token(data={"sub":user.email, "user_id": user.id})
    
    # 4. Return the standard OAuth2 token response 
    return{"access_token": access_token, "token_type":"bearer", "user_id":user.id}

# --- SECURE HISTORY ROUTE ---
@app.get("/api/v1/my-history/")
def get_my_history(
    current_user: User = Depends(get_current_user), # The Bouncer checks the token!
    db: Session = Depends(get_db)
):
    # Fetch only the analyses belonging to the logged-in user
    analyses = db.query(ResumeAnalysis).filter(ResumeAnalysis.user_id == current_user.id).order_by(ResumeAnalysis.id.desc()).all()
    return analyses


#Route to handle resume uploads (Added to the /api/v1/ path)
MAX_FILE_SIZE = 5 * 1024 * 1024 # 5 Megabytes

@app.post("/api/v1/upload-resume/")
@limiter.limit("5/minute")
async def upload_resume(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    job_description: str =Form(""),
    current_user: User = Depends(get_current_user),
    db:Session = Depends(get_db)
    ):
    
    file.file.seek(0, 2) # Go to the end of the file
    file_size = file.file.tell() # Get the size
    file.file.seek(0) # IMPORTANT: Reset the cursor back to the beginning!
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB.")
    
    #1. Validate file type
    if not file.filename.endswith(('.pdf','.docx')):
        return{"error":"Only PDF or DOCX files are allowed."}
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path,"wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    #2. Extract the text!    
    extracted_text = ""
    if file.filename.endswith('.pdf'):
        extracted_text = extract_text_from_pdf(file_path)
    elif file.filename.endswith('.docx'):
        extracted_text = extract_text_from_docx(file_path)
    
    # 3. Create a placeholder record in the DB    
   
# inside upload_resume...
    new_analysis = ResumeAnalysis(
    user_id=current_user.id,
    job_description=job_description or "",
    score=0,
    status="processing",
    # Wrap the empty lists in json.dumps() to ensure they are valid JSON strings
    skills=json.dumps([]),
    missing_skills=json.dumps([]),
    suggestions=json.dumps([])
)
    db.add(new_analysis)
    db.commit()
    db.refresh(new_analysis)
            
    # 4. Trigger the background task and respond IMMEDIATELY   
    background_tasks.add_task(run_ai_analysis, new_analysis.id, extracted_text, job_description)
    
    #  Return everything to React
    return {
        "analysis_id": new_analysis.id,
        "message": "Analysis started in background. Please check status shortly."
    }
    
@app.get("/api/v1/analysis-status/{analysis_id}")
def get_analysis_status(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    analysis = db.query(ResumeAnalysis).filter(ResumeAnalysis.id == analysis_id,ResumeAnalysis.user_id == current_user.id).first()
    
    #2 Safety Check
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    #3. The "is-ready" logic
    # We check if the score is > 0.
    # If it is, the background task has completed and we have results to show!
    return{
        "status": analysis.status,
        "is_ready": analysis.status == "completed",
        "data": {
            "score": analysis.score,
            "skills": analysis.skills,
            "missing_skills": analysis.missing_skills,
            "suggestions": analysis.suggestions
        } if analysis.status == "completed" else None
    }
    
    
            
    