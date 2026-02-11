from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


engine = create_engine(
    settings.resolved_database_url,
    echo = True,
    connect_args={
        "check_same_thread": False,
        "timeout": 30  # 增加 30 秒逾時，防止在 Electron 環境中因檔案存取延遲導致掛起
    } if "sqlite" in settings.resolved_database_url else {},
    pool_pre_ping=True if "postgresql" in settings.resolved_database_url else False,
    pool_size=5 if "postgresql" in settings.resolved_database_url else 0,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


def get_db():
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()

import os
import sys
from pathlib import Path

def get_db_path():
    # 檢查是否在 Electron 打包環境下 (通常會設定特定的環境變數)
    # 或者簡單判斷路徑是否包含 'resources'
    if "resources" in str(Path(__file__).resolve()):
        # 打包後存放在 C:\Users\User\AppData\Roaming\my-jitsi-app\app.db
        base_path = Path(os.getenv('APPDATA')) / "my-jitsi-app"
        base_path.mkdir(parents=True, exist_ok=True)
        return base_path / "app.db"
    
    # 開發環境：使用你截圖中的位置
    return Path(__file__).parent.parent / "app.db"

db_path = get_db_path()
SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_path}"

print(f"正在連接資料庫: {SQLALCHEMY_DATABASE_URL}")