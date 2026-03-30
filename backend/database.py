from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import JSONB

import os
from dotenv import load_dotenv
# 1. Update this URL with your actual password and database name
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# 2. Create the engine (the core interface to the database)
# echo=True will print the actual SQL commands to your terminal so you can see what it's doing
engine = create_engine(DATABASE_URL, echo=True)

# Create a factory for database sessions.
# main.py needs this to safely open and close connections for each user request.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 3. Set up the Base class for our ORM models
Base = declarative_base()

# 4. Define a simple User model (this will become a table in pgAdmin)
class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    name = Column(String)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    
    # Establish the relationship to the analyses table.
    # This tells SQLAlchemy that one User can own multiple resume analyses.
    
    analyses = relationship("ResumeAnalysis", back_populates="owner")
# NEW: 5. Define the ResumeAnalysis model (Table 2)    
class ResumeAnalysis(Base):
    __tablename__= "resume_analysis"    
    
    id = Column(Integer, primary_key=True, index=True)
    
    #ForeignKey creates the actual link between the two tables 
    user_id=Column(Integer,ForeignKey("users.id"))
    
    job_description = Column(Text, nullable=True)     
    score = Column(Integer)
    status = Column(String,default="processing")
    
    # We use the JSON column type to store the arrays of strings sent by the AI
    skills = Column(JSONB, default=[])                             
    missing_skills = Column(JSONB, default=[])                     
    suggestions = Column(JSONB, default=[])
    
    # Establish the relationship back to the user object in Python
    owner = relationship("User", back_populates="analyses")
    
# 6. Tell SQLAlchemy to create the tables in the database
if __name__ == "__main__":
    try:
        Base.metadata.create_all(engine)
        print("✅ Connection successful! The 'users' table was created.")
    except Exception as e:
        print("❌ Connection failed. Check your password and database name.")
        print(e)