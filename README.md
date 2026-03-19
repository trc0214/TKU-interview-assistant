# AI Interview Assistant

Electron + React + FastAPI system for interview operations, speech-to-text, and AI-assisted response coaching.

## What is optimized in this version

- AI workflow is now strict and modular: `STT validated text -> RAG retrieval -> AI coaching output`.
- Interview insights endpoint is fully async and returns UI-ready outputs for a 3-column meeting view.
- Azure STT diagnostics are operationalized with a dedicated benchmark script covering latency, no-match, cancellation, phrase-list, and recognition mode comparisons.

## Core architecture

### Frontend
- Electron shell + React pages under `src/renderer/src/pages`
- Interview assistant state and transcript pipeline under `src/renderer/src/features/interviewAssistant`
- Meeting page under `src/renderer/src/pages/meeting/meeting.tsx`

### Backend
- API routes under `backend/app/routers`
- AI and speech services under `backend/app/services`
- Main interview-assistant flow:
  - `backend/app/services/azure_speech.py`
  - `backend/app/services/unified_speech.py`
  - `backend/app/services/interview_assistant_retrieval.py`
  - `backend/app/services/interview_assistant_generation.py`
  - `backend/app/services/interview_assistant_pipeline.py`

## AI-driven interview workflow (enforced)

1. **Audio -> STT text**
   - Frontend captures audio and sends chunks to speech API.
   - Backend validates and normalizes transcript text before downstream AI processing.

2. **RAG retrieval (Vector context)**
   - Backend retrieves top relevant CheatSheet chunks via vector endpoint if configured.
   - If no external vector service is configured, local vector-like similarity fallback is used.

3. **AI coaching generation**
   - Prompt and generation logic are isolated from STT logic.
   - API returns two required coaching outputs:
     - `bufferStatement`
     - `structuredTalkingPoints` (exact 3-step structure)

4. **Three-column UI rendering**
   - Column 1: Conversation + STT controls
   - Column 2: AI coaching (`bufferStatement` + `structuredTalkingPoints`)
   - Column 3: Retrieved CheatSheets

## Quick start

### 1) Install frontend dependencies

```bash
npm install
```

### 2) Create Python virtual environment

PowerShell:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/pip install -r backend/requirements.txt
```

### 3) Configure backend environment

Copy `backend/env.example` -> `backend/.env` and fill values.

Required baseline:

```env
DATABASE_URL=sqlite:///./app.db
AUTH_SECRET_KEY=replace-with-long-secret
GEMINI_API_KEY=...
LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastasia
```

Optional RAG vector endpoint:

```env
VECTOR_STORE_ENDPOINT=https://your-vector-service/search
VECTOR_STORE_API_KEY=...
VECTOR_STORE_TIMEOUT_SECONDS=8
INTERVIEW_ASSISTANT_TOP_K=3
```

### 4) Run backend

```powershell
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

### 5) Run desktop app

```bash
npm run dev
```

### 6) Typecheck frontend

```bash
npm run typecheck
```

## Azure STT benchmark (latency + quality diagnostics)

Script: `backend/scripts/benchmark_azure_stt.py`

What it tests:
- `speech_recognition_language`
- profanity filtering options
- `SpeechServiceConnection_InitialSilenceTimeoutMs`
- **Single Utterance** vs **Continuous Recognition**
- phrase-list impact for technical terms (`RAG`, `MCP`, `Vector DB`)
- cancellation and no-match diagnostics

Example:

```powershell
backend/.venv/Scripts/python backend/scripts/benchmark_azure_stt.py ^
  --audio-file .\sample-interview.wav ^
  --languages en-US,zh-TW ^
  --profanity-options Masked,Raw,Removed ^
  --initial-silence-ms 1500,3000,5000 ^
  --phrase-terms "RAG,MCP,Vector DB" ^
  --reference-text "your expected transcript" ^
  --output-json azure_stt_benchmark_report.json
```

Interpretation guidance:
- If cancellations/no-match cluster around short timeout values, increase initial silence timeout.
- If technical keywords are repeatedly mistranscribed, enable phrase list and evaluate Custom Speech endpoint.
- Prefer continuous mode for long candidate answers; use single utterance for short-turn Q&A.

## Lean directory structure (proposed)

```text
backend/
  app/
    core/
    routers/
    services/
  scripts/
  requirements.txt
  env.example

src/
  main/
  preload/
  renderer/
    src/
      api/
      features/
      pages/

resources/
build/
README.md
package.json
```

## Cleanup recommendations

### Delete or archive (likely redundant/non-essential)
- `SPEECH_IMPLEMENTATION_SUMMARY.md`
- `SPEECH_INTEGRATION_GUIDE.md`
- `SPEECH_QUICK_REFERENCE.md`
- `SPEECH_INTEGRATION_EXAMPLES.tsx` (not source-mounted in app runtime)

Reason: Speech guidance is now consolidated into this README and service code.

### Keep but review for archival
- `class-capsule-v3/` (keep only if actively used in demos; otherwise move to `docs/archive/`)
- `backend/README.md` (can be replaced with a one-line pointer to root README)

### Ensure ignored in git
- `.venv/` (root virtualenv)
- `backend/.venv/`
- `azure_stt_benchmark_report*.json`

## API endpoints used by interview assistant

- `POST /api/v1/speech/transcribe`
- `POST /api/v1/speech/transcribe-bytes`
- `GET /api/v1/speech/status`
- `POST /api/v1/ai-analyses/interview-insights`

## Notes for maintainers

- Keep STT processing and LLM prompt logic separated by module boundaries.
- Prefer async I/O on all network/model boundaries.
- Treat fallback outputs as guarded behavior, not primary production logic.
- For production-grade RAG quality, connect a real vector DB service and domain-specific embeddings.
