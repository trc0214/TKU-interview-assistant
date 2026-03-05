# Backend - TKU Interview Assistant

A FastAPI-based REST API service for the Interview Assistant application. This backend handles user authentication, interview management, job descriptions, resume management, and AI-powered analysis using Google Gemini.

## 🏗️ Architecture Overview

```
FastAPI Server (Port 8000)
├── Authentication & Authorization
├── CRUD Operations for: Interviews, Jobs, Resumes
├── AI Analysis Service (Google Gemini Integration)
└── SQLite Database
```

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- pip (or poetry)
- Google Gemini API Key ([Get one here](https://aistudio.google.com/))

### Installation & Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   
   # Activate on Windows:
   venv\Scripts\activate
   
   # Activate on macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   ```bash
   copy env.example .env
   ```
   
   Edit `.env` and set:
   ```
   DATABASE_URL=sqlite:///./app.db
   GOOGLE_API_KEY=your_gemini_api_key_here
   SECRET_KEY=your_secret_key_here
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   CORS_ORIGINS=http://localhost:5173,http://localhost:3000
   ```

5. **Run the server**
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```

   The API will be available at: **http://localhost:8000**

## 📚 API Endpoints

### Interactive Documentation
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Core Endpoints

#### Authentication (`/api/auth`)
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get access token
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user info
- `POST /auth/logout` - Logout

#### Interviews (`/api/interviews`)
- `GET /interviews` - List all interviews
- `POST /interviews` - Create new interview
- `GET /interviews/{id}` - Get interview details
- `PUT /interviews/{id}` - Update interview
- `DELETE /interviews/{id}` - Delete interview

#### Jobs (`/api/jobs`)
- `GET /jobs` - List all jobs
- `POST /jobs` - Create new job
- `GET /jobs/{id}` - Get job details
- `PUT /jobs/{id}` - Update job
- `DELETE /jobs/{id}` - Delete job

#### Resumes (`/api/resumes`)
- `GET /resumes` - List all resumes
- `POST /resumes` - Create new resume
- `GET /resumes/{id}` - Get resume details
- `PUT /resumes/{id}` - Update resume
- `DELETE /resumes/{id}` - Delete resume

#### AI Analysis (`/api/ai-analyses`)
- `GET /ai-analyses` - List all analyses
- `POST /ai-analyses` - Create analysis (resume + job)
- `GET /ai-analyses/{id}` - Get analysis results
- `DELETE /ai-analyses/{id}` - Delete analysis

## 🗄️ Database Schema

### Users Table
```
- id (UUID, PK)
- username (String, unique)
- email (String, unique)
- hashed_password (String)
- created_at (DateTime)
- updated_at (DateTime)
```

### Jobs Table
```
- id (UUID, PK)
- user_id (FK to Users)
- title (String)
- description (Text)
- company (String)
- location (String)
- requirements (Text)
- created_at (DateTime)
- updated_at (DateTime)
```

### Resumes Table
```
- id (UUID, PK)
- user_id (FK to Users)
- title (String)
- content (Text)
- skills (JSON/List)
- experience (JSON/List)
- created_at (DateTime)
- updated_at (DateTime)
```

### Interviews Table
```
- id (UUID, PK)
- user_id (FK to Users)
- job_id (FK to Jobs, nullable)
- title (String)
- description (Text)
- date (DateTime)
- status (Enum: scheduled, completed, cancelled)
- notes (Text)
- created_at (DateTime)
- updated_at (DateTime)
```

### AI Analyses Table
```
- id (UUID, PK)
- user_id (FK to Users)
- resume_id (FK to Resumes)
- job_id (FK to Jobs)
- analysis (Text) - Gemini AI response
- score (Integer) - 0-100
- strengths (JSON/List)
- improvements (JSON/List)
- created_at (DateTime)
- updated_at (DateTime)
```

## 🔧 Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── models.py            # SQLAlchemy ORM models
│   ├── schemas.py           # Pydantic validation schemas
│   ├── crud.py              # Database operations
│   ├── db.py                # Database configuration
│   ├── deps.py              # Dependency injection
│   ├── seed.py              # Database seeding (sample data)
│   │
│   ├── core/
│   │   ├── config.py        # Configuration management
│   │   ├── security.py      # Auth & password hashing
│   │   └── __init__.py
│   │
│   ├── routers/             # API route handlers
│   │   ├── auth.py          # Auth endpoints
│   │   ├── interviews.py    # Interview endpoints
│   │   ├── jobs.py          # Job endpoints
│   │   ├── resumes.py       # Resume endpoints
│   │   ├── ai_analyses.py   # AI analysis endpoints
│   │   └── __init__.py
│   │
│   ├── services/            # Business logic
│   │   ├── gemini.py        # Google Gemini AI integration
│   │   └── __init__.py
│   │
│   └── __pycache__/
│
├── requirements.txt         # Python dependencies
├── env.example              # Environment variables template
├── README.md               # This file
└── .env                    # Local environment config (DO NOT COMMIT)
```

## 🔐 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `sqlite:///./app.db` | Database connection URI |
| `GOOGLE_API_KEY` | Yes | - | Google Gemini API key for AI analysis |
| `SECRET_KEY` | Yes | - | Secret key for JWT token signing |
| `ALGORITHM` | No | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | Token expiration time |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins |

### Demo Mode
If `GOOGLE_API_KEY` is not set, the API will return **deterministic mock analysis** for testing without spending API credits.

## 💻 Development

### Run with Auto-Reload
```bash
python -m uvicorn app.main:app --reload --port 8000
```

### Run Tests (when implemented)
```bash
pytest
```

### Database Migration
The database is auto-created on first run. To reset:
```bash
rm app.db
python -m uvicorn app.main:app --reload --port 8000
```

### Seed Sample Data
```bash
python -m app.seed
```

## 🔄 API Usage Examples

### Register User
```bash
curl -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "secure_password"
  }'
```

### Login
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "secure_password"
  }'
```

### Create a Job
```bash
curl -X POST "http://localhost:8000/api/jobs" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Software Engineer",
    "description": "We are hiring...",
    "company": "TechCorp",
    "location": "San Francisco, CA",
    "requirements": "5+ years experience..."
  }'
```

### Get All Jobs
```bash
curl -X GET "http://localhost:8000/api/jobs" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create AI Analysis
```bash
curl -X POST "http://localhost:8000/api/ai-analyses" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resume_id": "resume-uuid",
    "job_id": "job-uuid"
  }'
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Use a different port
python -m uvicorn app.main:app --reload --port 8001
```

### ModuleNotFoundError
```bash
# Ensure virtual environment is activated
# Reinstall dependencies
pip install -r requirements.txt
```

### CORS Errors
Update `CORS_ORIGINS` in `.env` to include your frontend URL:
```
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://yourdomain.com
```

### Gemini API Issues
- Verify `GOOGLE_API_KEY` is set correctly
- Check API rate limits
- Review API quota in Google Cloud Console

### Database Lock
If you get database lock errors:
```bash
rm app.db
# Restart the server
```

## 📦 Dependencies

Key packages installed from `requirements.txt`:
- **fastapi**: Web framework
- **uvicorn**: ASGI server
- **sqlalchemy**: ORM
- **pydantic**: Data validation
- **python-jose**: JWT handling
- **passlib**: Password hashing
- **google-generativeai**: Gemini API client
- **python-dotenv**: Environment config
- **python-multipart**: Form data handling
- **aiosqlite**: Async SQLite support

## 🚀 Deployment

### Docker (Optional)
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ /app/app/
COPY .env .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t tku-backend .
docker run -p 8000:8000 tku-backend
```

### Production Checklist
- [ ] Set strong `SECRET_KEY`
- [ ] Use environment variables for all sensitive data
- [ ] Enable HTTPS (use reverse proxy like Nginx)
- [ ] Set `CORS_ORIGINS` to specific domains only
- [ ] Configure database for production (PostgreSQL recommended)
- [ ] Add database backups
- [ ] Monitor API logs
- [ ] Set up rate limiting

## 🆘 Support

For issues or questions:
- Check the main [README.md](../README.md)
- View API docs at http://localhost:8000/docs
- Open an [Issue](https://github.com/trc0214/TKU-InterviewAssistant-v2/issues)

---

**Happy hacking! 🚀**
