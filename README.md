# AI Interview Assistant and Resume Management System

An Electron + React + FastAPI system for resume screening, interview workflow management, online interviews, transcript capture, and AI-assisted hiring decisions.

## What This Project Solves

- Resume screening is slow and inconsistent across reviewers.
- Interview outcomes are often hard to quantify or trace back to evidence.
- Online interviews, notes, AI scoring, and hiring decisions are usually split across different tools.

This project turns that into one workflow system:

- Job and resume management
- AI resume analysis
- LiveKit-based online interview room
- Real-time transcript capture and keyword extraction
- AI decision support that can write back to interview records
- Recoverable interview sessions with server-side audit trail

## Current Highlights

- Resume CRUD, job CRUD, interview CRUD, and JWT authentication
- AI resume analysis with Gemini-based baseline flow
- Custom model inference endpoint integration for interview insights
- LiveKit self-hosted meeting flow replacing public Jitsi rooms
- Interview session persistence:
  - server-side assistant session records
  - transcript entry persistence
  - meeting event audit trail
  - interrupted session recovery prompt
- Dashboard visualization for:
  - hiring funnel
  - AI score distribution
  - interview decision distribution
- Analysis history endpoint for preserving evidence across repeated runs

## Stack

- Desktop shell: Electron
- Frontend: React, TypeScript, React Router, Tailwind-style utility classes
- Backend: FastAPI, SQLAlchemy, Pydantic
- Online interview: LiveKit
- AI services:
  - Gemini API for resume analysis baseline
  - Custom REST model endpoint for interview insight inference
- Database:
  - SQLite for demo/local mode
  - PostgreSQL supported via DATABASE_URL

## Workspace Structure

- [src/renderer/src/pages](src/renderer/src/pages): main UI pages
- [src/renderer/src/features/interviewAssistant](src/renderer/src/features/interviewAssistant): transcript, draft, and recovery logic
- [src/renderer/src/features/meeting](src/renderer/src/features/meeting): LiveKit meeting panel
- [backend/app/routers](backend/app/routers): API routes
- [backend/app/services](backend/app/services): Gemini, custom model, LiveKit service logic
- [backend/app/models.py](backend/app/models.py): database models
- [backend/app/schemas.py](backend/app/schemas.py): API contracts

## Local Setup

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Create backend environment

Windows PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/pip install -r backend/requirements.txt
```

### 3. Configure backend environment variables

Copy [backend/env.example](backend/env.example) to `backend/.env` and fill in the values you actually use.

Minimum required for local demo:

```env
DATABASE_URL=sqlite:///./backend/app.db
AUTH_SECRET_KEY=replace-with-a-long-random-secret
GEMINI_API_KEY=...
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Optional custom interview model:

```env
CUSTOM_MODEL_ENDPOINT=https://your-model-service.example.com/inference/interview
CUSTOM_MODEL_API_KEY=...
CUSTOM_MODEL_AUTH_HEADER=Authorization
CUSTOM_MODEL_AUTH_SCHEME=Bearer
CUSTOM_MODEL_TIMEOUT_SECONDS=20
CUSTOM_MODEL_NAME=custom-interview-v1
```

### 4. Start backend

```powershell
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

### 5. Start Electron app

```bash
npm run dev
```

### 6. Validate types

```bash
npm run typecheck
```

## Demo Flow

Recommended competition demo script:

1. Create or select a job.
2. Import/select a resume.
3. Open AI analysis and show the matching result.
4. Enter the online interview room.
5. Show transcript growth, keyword extraction, and notes generation.
6. Trigger interview insight inference.
7. Apply AI recommendation back into rating, decision, and notes.
8. Re-open the meeting page and show recoverable session evidence.

## Interview Session Persistence

The online interview flow now records more than just final notes.

Persisted server-side:

- interview assistant session metadata
- transcript entries
- meeting events such as session start, connection, sync, error, and end
- latest notes snapshot and partial transcript text

This closes the earlier gap where interrupted interview data only lived in browser localStorage.

## Analysis History

The system now exposes history records for AI analysis runs so repeated analyses are not just presentation-only. This helps support:

- model comparison
- prompt iteration evidence
- competition presentation of iterative improvement

Related route:

- `GET /api/v1/ai-analyses/history`

## Important Config Notes

- LiveKit must be configured before the meeting page can join a room.
- SpeechRecognition is browser/runtime dependent; manual notes remain available even if live speech transcription is unavailable.
- SQLite is acceptable for demo mode, but PostgreSQL is recommended for multi-user or higher concurrency usage.

## Recommended Next Steps

- Add role-based access control for admin/interviewer/reviewer separation.
- Add a dedicated analysis history page with side-by-side comparison UI.
- Move transcript sync and AI inference to background jobs/websocket streams for heavier workloads.
- Add production database migrations instead of relying only on `create_all` for schema evolution.