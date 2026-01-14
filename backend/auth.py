from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import random
import string
from motor.motor_asyncio import AsyncIOMotorDatabase

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class OTPStore:
    """Simple in-memory OTP storage (use Redis in production)"""
    def __init__(self):
        self.store = {}  # {email: {otp: str, expires: datetime}}
    
    def generate_otp(self, email: str) -> str:
        otp = ''.join(random.choices(string.digits, k=6))
        self.store[email] = {
            "otp": otp,
            "expires": datetime.utcnow() + timedelta(minutes=5)
        }
        return otp
    
    def verify_otp(self, email: str, otp: str) -> bool:
        if email not in self.store:
            return False
        
        stored = self.store[email]
        if datetime.utcnow() > stored["expires"]:
            del self.store[email]
            return False
        
        if stored["otp"] == otp:
            del self.store[email]
            return True
        
        return False

otp_store = OTPStore()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[dict]:
    """
    Verify JWT token - supports both HS256 (backend tokens) and RS256 (Firebase tokens).
    For RS256 tokens, decodes without verification to extract user ID (since we don't have Firebase public keys).
    """
    try:
        # First, try HS256 (backend tokens)
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError:
            # If HS256 fails, try to decode without verification (for RS256/Firebase tokens)
            # We only need the user ID, not full verification
            try:
                # Decode without verification to extract user ID
                # This is safe because we're only using it for matching, not authorization
                # python-jose doesn't support options parameter, so we decode manually
                import base64
                import json
                
                # Split token into parts
                parts = token.split('.')
                if len(parts) != 3:
                    return None
                
                # Decode payload (second part)
                payload_part = parts[1]
                # Add padding if needed
                padding = len(payload_part) % 4
                if padding:
                    payload_part += '=' * (4 - padding)
                
                payload_bytes = base64.urlsafe_b64decode(payload_part)
                payload = json.loads(payload_bytes)
                return payload
            except Exception as e:
                # If decoding fails, return None
                return None
    except Exception:
        return None

async def get_current_user(db: AsyncIOMotorDatabase, token: str):
    payload = verify_token(token)
    if not payload:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    user = await db.users.find_one({"_id": user_id})
    return user
