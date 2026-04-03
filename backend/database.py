import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import JSONB # Best for Neon/Postgres
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL, 
    echo=True, 
    pool_pre_ping=True,  # Checks if connection is alive before querying
    pool_recycle=300     # Recycles connections every 5 minutes to keep Neon happy
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    
    # Matches the back_populates in AnalysisJob
    jobs = relationship("AnalysisJob", back_populates="owner")

class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"
    
    id =Column(Integer, primary_key = True,index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    status = Column(String, default = "pending")
    
    result = Column(JSONB, nullable = True)
    
    created_at = Column(DateTime, default = datetime.datetime.utcnow)
    
    owner = relationship("User", back_populates="jobs")

if __name__ == "__main__":
    try:
        Base.metadata.create_all(engine)
        print("✅ Tables created/verified successfully!")
    except Exception as e:
        print(f"❌ Connection failed: {e}")