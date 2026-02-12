from datetime import datetime, timedelta

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_access_token(data: dict) -> str:
    """Create a JWT access token with configured expiration."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token with configured expiration."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token, returning payload or None."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None


def create_file_token(application_id: str, doc_type: str, user_id: str) -> str:
    """Create a short-lived token for file access."""
    to_encode = {
        "application_id": application_id,
        "doc_type": doc_type,
        "user_id": user_id,
        "type": "file",
    }
    expire = datetime.utcnow() + timedelta(minutes=5)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_file_token(token: str) -> dict | None:
    """Decode and validate a file access token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "file":
            return None
        return payload
    except JWTError:
        return None


def create_media_token(media_id: str, user_id: str) -> str:
    """Create a short-lived token for media file access."""
    to_encode = {
        "media_id": media_id,
        "user_id": user_id,
        "type": "media",
    }
    expire = datetime.utcnow() + timedelta(minutes=5)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_media_token(token: str) -> dict | None:
    """Decode and validate a media access token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "media":
            return None
        return payload
    except JWTError:
        return None


def create_round_transcript_token(round_id: str, user_id: str) -> str:
    """Create a short-lived token for round transcript access."""
    to_encode = {
        "round_id": round_id,
        "user_id": user_id,
        "type": "round_transcript",
    }
    expire = datetime.utcnow() + timedelta(minutes=5)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_round_transcript_token(token: str) -> dict | None:
    """Decode and validate a round transcript access token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "round_transcript":
            return None
        return payload
    except JWTError:
        return None
