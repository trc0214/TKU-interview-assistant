from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app import crud, models
from app.core.security import AuthError, decode_token
from app.db import get_db


oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/v1/auth/login')


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> models.User:
  try:
    payload = decode_token(token)
  except AuthError as exc:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

  if payload.get('type') != 'access':
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token type')

  username = payload.get('sub')
  if not isinstance(username, str) or not username:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token payload')

  user = crud.get_user_by_username(db, username)
  if not user:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='User not found')
  return user
