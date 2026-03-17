import { request } from './http'
import type { Resume, ResumePdfParseResult } from './types'

export type ResumeCreate = {
  candidateName: string
  jobId: number
  resumeText: string
  education?: string
  yearsExp?: number
  skills?: string[]
}

export type ResumeUpdate = Partial<ResumeCreate> & {
  status?: Resume['status']
}

export function listResumes(params?: { jobId?: number }): Promise<Resume[]> {
  const qs = params?.jobId ? `?job_id=${encodeURIComponent(params.jobId)}` : ''
  return request<Resume[]>(`/resumes${qs}`)
}

export function getResume(resumeId: number): Promise<Resume> {
  return request<Resume>(`/resumes/${resumeId}`)
}

export function createResume(data: ResumeCreate): Promise<Resume> {
  return request<Resume>('/resumes', { method: 'POST', body: data })
}

export function updateResume(resumeId: number, data: ResumeUpdate): Promise<Resume> {
  return request<Resume>(`/resumes/${resumeId}`, { method: 'PUT', body: data })
}

export function deleteResume(resumeId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/resumes/${resumeId}`, { method: 'DELETE' })
}

export function parseResumePdf(file: File): Promise<ResumePdfParseResult> {
  const formData = new FormData()
  formData.append('file', file)
  return request<ResumePdfParseResult>('/resumes/parse-pdf', { method: 'POST', body: formData })
}
