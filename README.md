# TKU Interview Assistant v2

An intelligent interview preparation and analysis tool powered by AI. This application helps users prepare for interviews, analyze job descriptions, manage resumes, and get AI-powered feedback on their interview performance.

## 🎯 Features

- **Interview Management**: Create, track, and analyze interview sessions
- **Job Analysis**: Upload and analyze job descriptions
- **Resume Management**: Store and manage multiple resumes
- **AI Analysis**: Get AI-powered insights on interview performance and job fit
- **Dashboard**: Overview of all your preparation progress
- **Authentication**: Secure user authentication and session management

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast build and HMR
- **Tailwind CSS** for styling
- **Electron** for desktop application
- **React Router** for navigation

### Backend
- **FastAPI** (Python) for REST API
- **SQLAlchemy** for ORM
- **Google Gemini AI** for analysis
- **SQLite** for database

## 📁 Project Structure

```
├── src/                       # Frontend source code
│   ├── main/                 # Electron main process
│   ├── preload/              # Electron preload scripts
│   └── renderer/             # React application
│       ├── src/
│       │   ├── components/   # Reusable React components
│       │   ├── pages/        # Page components
│       │   ├── api/          # API client functions
│       │   ├── auth/         # Authentication context and helpers
│       │   └── utils/        # Utility functions
│       └── index.html
├── backend/                   # Backend source code
│   └── app/
│       ├── main.py          # FastAPI application entry point
│       ├── models.py        # SQLAlchemy models
│       ├── schemas.py       # Pydantic schemas
│       ├── crud.py          # Database operations
│       ├── routers/         # API route handlers
│       ├── services/        # Business logic (Gemini AI, etc.)
│       └── core/            # Configuration and security
├── package.json             # Frontend dependencies
├── tsconfig.json            # TypeScript configuration
├── electron-builder.yml     # Electron build configuration
└── README.md               # This file
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Python** 3.8+
- **pip**
- **Google Gemini API Key** (get one at [https://aistudio.google.com/](https://aistudio.google.com/))

### Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/trc0214/TKU-InterviewAssistant-v2.git
cd TKU-InterviewAssistant-v2
```

#### 2. Frontend Setup

```bash
# Install dependencies
npm install

# Copy environment file and update with your settings
cp .env.example .env.local
```

#### 3. Backend Setup

```bash
cd backend

# Create a virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with your configuration
cp env.example .env
```

Update `backend/.env` with your settings:
```
DATABASE_URL=sqlite:///./app.db
GOOGLE_API_KEY=your_gemini_api_key_here
SECRET_KEY=your_secret_key_here
```

## 🏃 Running the Application

### Development Mode

#### Terminal 1 - Backend API

```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

#### Terminal 2 - Frontend Development

```bash
npm run dev
```

The application will open at `http://localhost:5173`

### Building for Production

#### Build Frontend

```bash
npm run build
```

#### Build Electron App

```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## 📚 API Documentation

Once the backend is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### 1. Fork and Clone
```bash
git clone https://github.com/YOUR_USERNAME/TKU-InterviewAssistant-v2.git
cd TKU-InterviewAssistant-v2
```

### 2. Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### 3. Make Your Changes
- Follow the existing code style
- Add comments for complex logic
- Test your changes locally

### 4. Commit Your Changes
```bash
git commit -m "feat: add your feature description"
```

Use conventional commit messages:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `style:` for code style changes
- `refactor:` for code refactoring
- `test:` for test additions
- `chore:` for maintenance tasks

### 5. Push and Create a Pull Request
```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

## 📖 Development Guidelines

- **Frontend**: Use functional components with hooks, TypeScript for type safety
- **Backend**: Follow PEP 8, use type hints, write docstrings
- **Database**: Keep migrations organized, use SQLAlchemy ORM
- **Git**: Commit frequently with clear messages

## 🐛 Troubleshooting

### Backend Connection Issues
- Ensure the backend is running on `http://localhost:8000`
- Check `backend/.env` has correct configuration
- Verify GOOGLE_API_KEY is set correctly

### Frontend Build Issues
- Delete `node_modules` and `package-lock.json`, then run `npm install`
- Clear Vite cache: `rm -rf dist` and retry

### Database Issues
- Reset database: Delete `backend/app.db` and restart the backend
- Run migrations if applicable

## 📝 License

This project is open source. Please check the LICENSE file for details.

## 👥 Maintainers

- **Project Lead**: [@trc0214](https://github.com/trc0214)

## 📧 Contact & Support

For questions, suggestions, or issues:
- Open an [Issue](https://github.com/trc0214/TKU-InterviewAssistant-v2/issues)
- Submit a [Pull Request](https://github.com/trc0214/TKU-InterviewAssistant-v2/pulls)

---

**Happy Interviewing! 🎤✨**
