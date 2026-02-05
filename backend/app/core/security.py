from __future__ import annotations

import datetime as dt

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings


_pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


class AuthError(Exception):
  pass


def hash_password(password: str) -> str:
  return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
  return _pwd_context.verify(password, password_hash)


def _require_secret() -> str:
  if settings.auth_secret_key and settings.auth_secret_key.strip():
    return settings.auth_secret_key
  raise AuthError('AUTH_SECRET_KEY is not configured')


def create_access_token(*, subject: str, user_id: int) -> str:
  now = dt.datetime.now(dt.timezone.utc)
  expire = now + dt.timedelta(minutes=settings.access_token_expire_minutes)
  payload = {
    'sub': subject,
    'id': user_id,
    'iat': int(now.timestamp()),
    'exp': expire,
    'type': 'access',
  }
  return jwt.encode(payload, _require_secret(), algorithm=settings.auth_algorithm)


def create_refresh_token(*, subject: str, user_id: int) -> str:
  now = dt.datetime.now(dt.timezone.utc)
  expire = now + dt.timedelta(days=settings.refresh_token_expire_days)
  payload = {
    'sub': subject,
    'id': user_id,
    'iat': int(now.timestamp()),
    'exp': expire,
    'type': 'refresh',
  }
  return jwt.encode(payload, _require_secret(), algorithm=settings.auth_algorithm)


def decode_token(token: str) -> dict:
  try:
    return jwt.decode(token, _require_secret(), algorithms=[settings.auth_algorithm])
  except JWTError as exc:
    raise AuthError('Invalid token') from exc
