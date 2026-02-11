# Backend (FastAPI + SQLite)

This backend provides RESTful JSON APIs for:

- Jobs (CRUD)
- Resumes (create/list/get; linked to a Job)
- AI Analysis (one resume × one job; stored)

## Run

From the repo root:

```bash
cd backend
py -3.11 -m venv .venv
./.venv/Scripts/Activate.ps1
pip install -r requirements.txt
copy env.example .env
python -m uvicorn app.main:app --port 8000
```

API docs:

- http://localhost:8000/docs

## Env vars

- `GEMINI_API_KEY`: required to call Gemini.
  - If missing, API will return a deterministic **mock** analysis (demo-friendly).
- `CORS_ORIGINS`: comma-separated origins (default `http://localhost:5173`).
