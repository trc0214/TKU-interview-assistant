export type JobStatus = 'open' | 'closed'
export type ResumeStatus = 'received' | 'analyzed' | 'interviewed'

export type Job = {
  id: number
  title: string
  department: string
  description: string
  requiredSkills: string[]
  niceToHave: string[]
  status: JobStatus
  createdAt: string
  experienceLevel: '0-1' | '2-3' | '4-6' | '7+'
  education: '不限' | '大學' | '碩士' | '博士' | string
  aiResumeMatchingEnabled: boolean
  aiQuestionGenEnabled: boolean
}

export type Resume = {
  id: number
  candidateName: string
  jobId: number
  resumeText: string
  status: ResumeStatus
  education: string
  yearsExp: number
  skills: string[]
  submittedAt: string

  appliedJobTitle?: string | null
  aiMatchScore?: number | null
  aiSummary?: string | null
  matchHighlights: string[]
  analysisId?: number | null
}

export type AIAnalysis = {
  id: number
  jobId: number
  resumeId: number
  createdAt: string
  model: string
  promptVersion: string

  overallScore: number
  professionalScore: number
  communicationScore: number
  problemSolvingScore: number

  summary: string
  strengths: string[]
  risks: string[]
  suggestedQuestions: string[]

  isMock: boolean
  rawResponse: Record<string, unknown>
}

export type InterviewStatus = 'scheduled' | 'completed' | 'canceled'

export type Interview = {
  id: number
  jobId: number
  resumeId: number
  scheduledAt?: string | null
  status: InterviewStatus

  interviewRound: string
  interviewer: string
  meetingLink: string
  location: string

  notes: string
  decision: string
  rating?: number | null

  createdAt: string
  updatedAt: string

  jobTitle?: string | null
  department?: string | null
  candidateName?: string | null
}

export type AuthTokens = {
  accessToken: string
  refreshToken?: string | null
  tokenType?: string
}

export type User = {
  id: number
  username: string
  createdAt: string
}
