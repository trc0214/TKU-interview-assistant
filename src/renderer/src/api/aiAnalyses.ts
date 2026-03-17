import { request } from './http'
import type { AIAnalysis, AIAnalysisHistory, InterviewInsight } from './types'

export function listAnalyses(params?: { jobId?: number; resumeId?: number }): Promise<AIAnalysis[]> {
  const parts: string[] = []
  if (params?.jobId) parts.push(`job_id=${encodeURIComponent(params.jobId)}`)
  if (params?.resumeId) parts.push(`resume_id=${encodeURIComponent(params.resumeId)}`)
  const qs = parts.length ? `?${parts.join('&')}` : ''
  return request<AIAnalysis[]>(`/ai-analyses${qs}`)
}

export function createAnalysis(data: {
  jobId: number
  resumeId: number
  force?: boolean
  extraConditions?: string
}): Promise<AIAnalysis> {
  return request<AIAnalysis>('/ai-analyses', { method: 'POST', body: data })
}

export function inferInterviewInsights(data: {
  interviewId?: number
  jobId?: number
  resumeId?: number
  candidateName?: string
  interviewer?: string
  interviewRound?: string
  transcriptText: string
  notesText?: string
  keyTerms?: string[]
  focusPriority?: string
  context?: Record<string, unknown>
}): Promise<InterviewInsight> {
  return request<InterviewInsight>('/ai-analyses/interview-insights', { method: 'POST', body: data })
}

export function listAnalysisHistory(params?: { jobId?: number; resumeId?: number }): Promise<AIAnalysisHistory[]> {
  const parts: string[] = []
  if (params?.jobId) parts.push(`job_id=${encodeURIComponent(params.jobId)}`)
  if (params?.resumeId) parts.push(`resume_id=${encodeURIComponent(params.resumeId)}`)
  const qs = parts.length ? `?${parts.join('&')}` : ''
  return request<AIAnalysisHistory[]>(`/ai-analyses/history${qs}`)
}
