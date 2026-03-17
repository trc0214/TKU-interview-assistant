import { request } from './http'
import type { Interview, InterviewAssistantSession, InterviewMeetingToken, InterviewTranscriptEntry } from './types'

export type InterviewCreate = {
  jobId: number
  resumeId: number
  scheduledAt?: string | null
  status?: 'scheduled' | 'in_progress' | 'interrupted' | 'awaiting_review' | 'completed' | 'canceled'

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

export function createInterviewMeetingToken(data: {
  interviewId?: number
  roomName?: string
  participantName?: string
}): Promise<InterviewMeetingToken> {
  return request<InterviewMeetingToken>('/interviews/meeting-token', { method: 'POST', body: data })
}

export function getLatestInterviewAssistantSession(interviewId: number): Promise<InterviewAssistantSession | null> {
  return request<InterviewAssistantSession | null>(`/interviews/${interviewId}/assistant-session/latest`)
}

export function startInterviewAssistantSession(
  interviewId: number,
  data: {
    roomName: string
    participantIdentity: string
    participantDisplayName?: string
  }
): Promise<InterviewAssistantSession> {
  return request<InterviewAssistantSession>(`/interviews/${interviewId}/assistant-session/start`, {
    method: 'POST',
    body: data,
  })
}

export function syncInterviewAssistantSession(
  interviewId: number,
  data: {
    sessionId: number
    notes?: string
    partialText?: string
    meetingConnected?: boolean
    transcriptEntries?: InterviewTranscriptEntry[]
    eventType?: string
    eventPayload?: Record<string, unknown>
  }
): Promise<InterviewAssistantSession> {
  return request<InterviewAssistantSession>(`/interviews/${interviewId}/assistant-session/sync`, {
    method: 'POST',
    body: data,
  })
}

export function endInterviewAssistantSession(
  interviewId: number,
  data: {
    sessionId: number
    reason?: 'completed' | 'disconnected' | 'canceled'
    notes?: string
    partialText?: string
  }
): Promise<InterviewAssistantSession> {
  return request<InterviewAssistantSession>(`/interviews/${interviewId}/assistant-session/end`, {
    method: 'POST',
    body: data,
  })
}
