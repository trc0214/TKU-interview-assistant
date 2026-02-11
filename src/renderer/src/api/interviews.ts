import { request } from './http'
import type { Interview } from './types'

export type InterviewCreate = {
  jobId: number
  resumeId: number
  scheduledAt?: string | null
  status?: 'scheduled' | 'completed' | 'canceled'

  interviewRound?: string
  interviewer?: string
  meetingLink?: string
  location?: string

  notes?: string
  decision?: string
  rating?: number | null
}

export type InterviewUpdate = Partial<InterviewCreate>

export function listInterviews(params?: { jobId?: number; resumeId?: number; status?: string }): Promise<Interview[]> {
  const parts: string[] = []
  if (params?.jobId) parts.push(`job_id=${encodeURIComponent(params.jobId)}`)
  if (params?.resumeId) parts.push(`resume_id=${encodeURIComponent(params.resumeId)}`)
  if (params?.status) parts.push(`status=${encodeURIComponent(params.status)}`)
  const qs = parts.length ? `?${parts.join('&')}` : ''
  return request<Interview[]>(`/interviews${qs}`)
}

export function getInterview(interviewId: number): Promise<Interview> {
  return request<Interview>(`/interviews/${interviewId}`)
}

export function createInterview(data: InterviewCreate): Promise<Interview> {
  return request<Interview>('/interviews', { method: 'POST', body: data })
}

export function updateInterview(interviewId: number, data: InterviewUpdate): Promise<Interview> {
  return request<Interview>(`/interviews/${interviewId}`, { method: 'PUT', body: data })
}

export function deleteInterview(interviewId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/interviews/${interviewId}`, { method: 'DELETE' })
}
