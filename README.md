# TKU Interview Assistant

An intelligent interview preparation and analysis tool powered by AI. The application supports interview-session management, job-description analysis, resume management, AI-assisted feedback, dashboard views, and authentication.

## Tech stack

### Frontend
- React with TypeScript
- Vite
- Tailwind CSS
- Electron
- React Router

### Backend
- FastAPI (Python)
- SQLAlchemy
- Google Gemini AI
- SQLite

## Project structure

```text
├── src/
│   ├── main/                 # Electron main process
│   ├── preload/              # Electron preload scripts
│   └── renderer/             # React application
├── backend/
│   └── app/
│       ├── main.py           # FastAPI entry point
│       ├── models.py
│       ├── schemas.py
│       ├── crud.py
│       ├── routers/
│       ├── services/
│       └── core/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── AGENTS.md
└── README.md
```

## Prerequisites

- Node.js and npm
- Python 3.8+
- pip
- Google Gemini API key for AI analysis features

## Installation

Clone the current repository:

```bash
git clone https://github.com/trc0214/TKU-interview-assistant.git
cd TKU-interview-assistant
```

Frontend setup:

```bash
npm install
cp .env.example .env.local
```

Backend setup:

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
cp env.example .env
```

Example backend configuration:

```env
DATABASE_URL=sqlite:///./app.db
GOOGLE_API_KEY=your_gemini_api_key_here
SECRET_KEY=your_secret_key_here
```

Do not commit local environment files, secrets, virtual environments, runtime SQLite databases, Python caches, or build output.

## Running the application

Backend API:

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The development API is available at `http://localhost:8000`, with Swagger UI at `/docs` and ReDoc at `/redoc`.

Frontend development:

```bash
npm run dev
```

Production builds use the scripts defined in `package.json`, including the Electron platform build commands when available.

## Development

- Keep frontend changes within the React/TypeScript/Electron boundary and backend changes within the FastAPI/SQLAlchemy boundary unless a cross-layer change is intentional.
- Keep tests version-controlled; test files are source artifacts, not generated output.
- Use Conventional Commits where practical.
- Keep PRs single-purpose and document validation performed.
- See [`AGENTS.md`](AGENTS.md) for repository-specific branch, verification, secret-handling, issue, PR, and AI-handoff rules.

## Troubleshooting

### Backend connection issues
- Ensure the FastAPI backend is running on the configured port.
- Verify `backend/.env` exists locally and contains the expected configuration.
- Verify the Gemini API key when AI analysis calls fail.

### Frontend build issues
- Reinstall dependencies if local `node_modules` state is inconsistent.
- Clear generated Vite/build output before rebuilding when necessary.

### Database issues
- `backend/app.db` is local runtime state and is ignored by Git.
- Resetting a local database is destructive; only delete it when local data can be recreated safely.

## License

No software license has been selected for this repository at this time. Repository visibility does not by itself grant permission to copy, modify, or redistribute the code. Add a `LICENSE` file only after the maintainer makes an explicit licensing decision.

## Maintainer

Project lead: [@trc0214](https://github.com/trc0214)

For project discussion, use the current repository's GitHub Issues and Pull Requests.
