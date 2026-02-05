from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import crud
from app.core.security import (
  AuthError,
  create_access_token,
  create_refresh_token,
  decode_token,
  hash_password,
  verify_password,
)
from app.db import get_db
from app.schemas import AuthLogin, AuthRegister, TokenOut, UserOut


router = APIRouter(tags=['auth'])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/v1/auth/login')


def _get_current_user(db: Session, token: str) -> UserOut:
  try:
    payload = decode_token(token)
  except AuthError as exc:
    raise HTTPException(status_code=401, detail=str(exc)) from exc

  if payload.get('type') != 'access':
    raise HTTPException(status_code=401, detail='Invalid token type')

  username = payload.get('sub')
  if not isinstance(username, str) or not username:
    raise HTTPException(status_code=401, detail='Invalid token payload')

  user = crud.get_user_by_username(db, username)
  if not user:
    raise HTTPException(status_code=401, detail='User not found')

  return UserOut.model_validate(user)


@router.post('/auth/register')
def register(data: AuthRegister, db: Session = Depends(get_db)):
  existing = crud.get_user_by_username(db, data.username)
  if existing:
    raise HTTPException(status_code=409, detail='帳戶名稱已存在')

  password_hash = hash_password(data.password)
  crud.create_user(db, username=data.username, password_hash=password_hash)
  return {'ok': True}


@router.post('/auth/login', response_model=TokenOut)
def login(data: AuthLogin, db: Session = Depends(get_db)):
  user = crud.get_user_by_username(db, data.username)
  if not user or not verify_password(data.password, user.password_hash):
    raise HTTPException(status_code=401, detail='帳號或密碼錯誤')

  try:
    access_token = create_access_token(subject=user.username, user_id=user.id)
    refresh_token = create_refresh_token(subject=user.username, user_id=user.id)
  except AuthError as exc:
    raise HTTPException(status_code=500, detail=str(exc)) from exc

  return TokenOut(access_token=access_token, refresh_token=refresh_token)


@router.get('/auth/me', response_model=UserOut)
def me(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
  return _get_current_user(db, token)


@router.post('/auth/refresh', response_model=TokenOut)
def refresh(payload: dict, db: Session = Depends(get_db)):
  token = payload.get('refreshToken') or payload.get('refresh_token')
  if not token:
    raise HTTPException(status_code=400, detail='Refresh token required')

  try:
    data = decode_token(token)
  except AuthError as exc:
    raise HTTPException(status_code=401, detail=str(exc)) from exc

  if data.get('type') != 'refresh':
    raise HTTPException(status_code=401, detail='Invalid token type')

  username = data.get('sub')
  if not isinstance(username, str) or not username:
    raise HTTPException(status_code=401, detail='Invalid token payload')

  user = crud.get_user_by_username(db, username)
  if not user:
    raise HTTPException(status_code=401, detail='User not found')

  access_token = create_access_token(subject=user.username, user_id=user.id)
  refresh_token = create_refresh_token(subject=user.username, user_id=user.id)
  return TokenOut(access_token=access_token, refresh_token=refresh_token)
