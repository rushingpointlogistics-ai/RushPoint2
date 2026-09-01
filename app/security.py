import os
import json
import jwt
import bcrypt
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database import get_db_connection

JWT_SECRET = os.getenv("JWT_SECRET", "rushingpoint-super-secure-production-secret-key-999")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security_scheme = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_jwt_token(payload_data: dict, expires_delta: timedelta = None) -> str:
    to_encode = payload_data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials token.")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header missing.")
    
    token = credentials.credentials
    payload = decode_jwt_token(token)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")
    
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account no longer exists.")
    
    if user["status"] in ["SUSPENDED", "DISABLED", "REJECTED"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail=f"Account is currently {user['status']}. Contact RushingPoint administration."
        )
    
    return dict(user)

def require_role(allowed_roles: list[str]):
    def role_checker(current_user: dict = Depends(get_current_user)):
        account_type = current_user.get("account_type")
        role_name = current_user.get("role_name", "")
        
        # Super Admin always bypasses role checks
        if account_type == "ADMIN" or role_name == "Super Admin":
            return current_user
        
        if account_type in allowed_roles or role_name in allowed_roles:
            return current_user
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Required roles: {', '.join(allowed_roles)}. Your role: {role_name or account_type}"
        )
    return role_checker

def log_audit(actor_user: dict, action: str, resource_type: str, resource_id: str = None, details: dict = None, ip: str = "127.0.0.1"):
    try:
        conn = get_db_connection()
        conn.execute("""
            INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, resource_type, resource_id, details_json, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()),
            actor_user.get("id", "SYSTEM"),
            actor_user.get("full_name", "System Administrator"),
            actor_user.get("role_name", actor_user.get("account_type", "SYSTEM")),
            action,
            resource_type,
            resource_id,
            json.dumps(details or {}, default=str),
            ip,
            datetime.now(timezone.utc).isoformat()
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error recording audit log: {e}")
