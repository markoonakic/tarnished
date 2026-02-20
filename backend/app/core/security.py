import base64
import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_access_token(data: dict) -> str:
    """Create a JWT access token with configured expiration."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token with configured expiration."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
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
    expire = datetime.now(UTC) + timedelta(minutes=5)
    to_encode["exp"] = expire  # type: ignore[assignment]
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
    expire = datetime.now(UTC) + timedelta(minutes=5)
    to_encode["exp"] = expire  # type: ignore[assignment]
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
    expire = datetime.now(UTC) + timedelta(minutes=5)
    to_encode["exp"] = expire  # type: ignore[assignment]
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


def _get_fernet_key() -> bytes:
    """Derive a Fernet-compatible key from the SECRET_KEY.

    Fernet requires a 32-byte base64-encoded key. We derive this from
    the application's SECRET_KEY using SHA-256.

    Returns:
        A 32-byte base64-encoded key suitable for Fernet.
    """
    # Hash the secret key to get a consistent 32 bytes
    key_hash = hashlib.sha256(settings.secret_key.encode()).digest()
    # Base64 encode to get valid Fernet key format
    return base64.urlsafe_b64encode(key_hash)


def encrypt_api_key(api_key: str) -> str:
    """Encrypt an API key using Fernet symmetric encryption.

    Args:
        api_key: The plaintext API key to encrypt.

    Returns:
        The encrypted API key as a string.
    """
    fernet = Fernet(_get_fernet_key())
    encrypted = fernet.encrypt(api_key.encode())
    return encrypted.decode()


def decrypt_api_key(encrypted_key: str) -> str | None:
    """Decrypt an API key that was encrypted with Fernet.

    Args:
        encrypted_key: The encrypted API key string.

    Returns:
        The decrypted API key, or None if decryption fails.
    """
    try:
        fernet = Fernet(_get_fernet_key())
        decrypted = fernet.decrypt(encrypted_key.encode())
        return decrypted.decode()
    except InvalidToken:
        logger.error("Failed to decrypt API key - invalid token or wrong secret key")
        return None
    except Exception as e:
        logger.error(f"Failed to decrypt API key: {e}")
        return None


def generate_api_token() -> str:
    """Generate a secure random API token.

    Creates a 32-character hexadecimal string using cryptographically
    secure random bytes. This is used for authenticating external API
    requests.

    Returns:
        A 32-character hexadecimal string (16 random bytes).
    """
    return secrets.token_hex(16)
