import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './layout/AppShell'
import { DashboardPage } from './pages/Dashboard'
import { JobsListPage } from './pages/jobs/JobsList'
import { JobFormPage } from './pages/jobs/JobForm'
import { JobDetailPage } from './pages/jobs/JobDetail'
import { ResumesListPage } from './pages/resumes/ResumesList'
import { ResumeDetailPage } from './pages/resumes/ResumeDetail'
import { ResumeFormPage } from './pages/resumes/ResumeForm'
import { AiAnalysisPage } from './pages/ai/AiAnalysis'
import { SettingsPage } from './pages/settings/Settings'
import { InterviewsListPage } from './pages/interviews/InterviewsList'
import { InterviewFormPage } from './pages/interviews/InterviewForm'
import { InterviewDetailPage } from './pages/interviews/InterviewDetail'
import { NotFoundPage } from './pages/NotFound'
import { LoginPage } from './pages/auth/LoginPage'
import { MeetingPage } from './pages/meeting/meeting'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />

            <Route path="/jobs" element={<JobsListPage />} />
            <Route path="/jobs/new" element={<JobFormPage mode="create" />} />
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
            <Route path="/jobs/:jobId/edit" element={<JobFormPage mode="edit" />} />

            <Route path="/resumes" element={<ResumesListPage />} />
            <Route path="/resumes/new" element={<ResumeFormPage />} />
            <Route path="/resumes/:resumeId" element={<ResumeDetailPage />} />

            <Route path="/interviews" element={<InterviewsListPage />} />
            <Route path="/interviews/new" element={<InterviewFormPage mode="create" />} />
            <Route path="/interviews/:interviewId" element={<InterviewDetailPage />} />
            <Route path="/interviews/:interviewId/edit" element={<InterviewFormPage mode="edit" />} />

            <Route path="/ai-analysis" element={<AiAnalysisPage />} />
            <Route path="/ai-analysis/:resumeId" element={<AiAnalysisPage />} />

            <Route path="/meeting" element={<MeetingPage />} />

            <Route path="/settings" element={<SettingsPage />} />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
