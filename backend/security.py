from datetime import datetime, timedelta
import jwt 
import bcrypt

#In production hide this in .env file
SECRET_KEY = "your-super-secret-development-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def get_password_hash(password: str) -> str:
    """Converts a plain password into a secure bcrypt hash."""
    # Bcrypt requires bytes, so we encode the string to utf-8 first
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed_bytes.decode('utf-8') # Decode back to a string for the database


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Checks if the plain password matches the encrypted hash."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict) -> str:
    """Generates the JWT (JSON Web Token)."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm = ALGORITHM)
    return encoded_jwt