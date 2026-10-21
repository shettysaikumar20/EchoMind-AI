from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.entities import User

security_scheme = HTTPBearer(auto_error=False)


def get_current_user_optional(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    if not auth:
        return None
    token = auth.credentials
    user_id = decode_access_token(token)
    if not user_id:
        return None
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    return user


def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    user = get_current_user_optional(auth, db)
    if user:
        return user
    
    # If no auth header provided, check or auto-provision default demo user for seamless local testing
    default_user = db.query(User).filter(User.email == "demo@echomind.ai").first()
    if not default_user:
        from app.core.security import get_password_hash
        default_user = User(
            email="demo@echomind.ai",
            hashed_password=get_password_hash("echomind123!"),
            name="EchoMind User"
        )
        db.add(default_user)
        db.commit()
        db.refresh(default_user)
    return default_user
