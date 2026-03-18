from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  _backend_dir = Path(__file__).resolve().parents[2]
  _repo_root = Path(__file__).resolve().parents[3]

  model_config = SettingsConfigDict(
    env_file=(
      (_backend_dir / '.env'),
      (_repo_root / '.env'),
    ),
    env_file_encoding='utf-8',
    extra='ignore',
  )

  database_url: str | None = None

  auth_secret_key: str | None = None
  auth_algorithm: str = 'HS256'
  access_token_expire_minutes: int = 30
  refresh_token_expire_days: int = 7

  gemini_api_key: str | None = None
  gemini_model: str = 'gemini-2.5-flash'
  gemini_endpoint: str = 'https://generativelanguage.googleapis.com/v1beta/models'

  custom_model_endpoint: str | None = None
  custom_model_api_key: str | None = None
  custom_model_auth_header: str = 'Authorization'
  custom_model_auth_scheme: str = 'Bearer'
  custom_model_timeout_seconds: int = 20
  custom_model_name: str = 'custom-interview-v1'

  livekit_url: str | None = None
  livekit_api_key: str | None = None
  livekit_api_secret: str | None = None

  # Azure Speech-to-Text settings
  azure_speech_key: str | None = None
  azure_speech_region: str | None = None
  azure_speech_language: str = 'zh-TW'

  # Whisper fallback settings
  whisper_model: str = 'base'
  whisper_device: str = 'cpu'
  whisper_use_fallback: bool = True

  cors_origins: str = 'http://localhost:5173,http://localhost:5174'

  @property
  def resolved_database_url(self) -> str:
    if self.database_url:
      return self.database_url

    db_path = Path(__file__).resolve().parents[2] / 'app.db'
    return f"sqlite:///{db_path.as_posix()}"

  @property
  def cors_origins_list(self) -> list[str]:
    return [o.strip() for o in self.cors_origins.split(',') if o.strip()]


settings = Settings()
