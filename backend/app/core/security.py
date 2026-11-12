"""Hash de senha, JWT de acesso e tokens opacos (refresh / redefinição de senha)."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import Settings

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"

# Argon2id com sal aleatório por hash (embutido no próprio hash).
_password_hasher = PasswordHasher()
# Hash de referência para manter o tempo de resposta do login igual quando o e-mail não existe.
_DUMMY_HASH = _password_hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _password_hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _password_hasher.check_needs_rehash(password_hash)


@dataclass(frozen=True)
class AccessClaims:
    user_id: uuid.UUID
    session_version: int
    issued_at: datetime
    expires_at: datetime


class InvalidTokenError(Exception):
    pass


def create_access_token(user_id: uuid.UUID, session_version: int, settings: Settings) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "sv": session_version,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, settings: Settings) -> AccessClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat", "type", "sv"]},
        )
        session_version = payload["sv"]
        if payload.get("type") != ACCESS_TOKEN_TYPE or not isinstance(session_version, int) or isinstance(session_version, bool):
            raise InvalidTokenError
        return AccessClaims(
            user_id=uuid.UUID(str(payload["sub"])),
            session_version=session_version,
            issued_at=datetime.fromtimestamp(int(payload["iat"]), UTC),
            expires_at=datetime.fromtimestamp(int(payload["exp"]), UTC),
        )
    except (jwt.PyJWTError, ValueError, TypeError) as error:
        raise InvalidTokenError from error


def new_opaque_token() -> str:
    """Token aleatório de 256 bits para refresh e redefinição de senha."""
    return secrets.token_urlsafe(32)


def hash_opaque_token(token: str) -> str:
    """Só o SHA-256 é guardado no banco; o valor original existe apenas com o usuário."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
