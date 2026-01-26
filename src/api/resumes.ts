import { request } from './http'
import type { Resume } from './types'

export type ResumeCreate = {
  candidateName: string
  jobId: number
  resumeText: string
  education?: string
  yearsExp?: number
  skills?: string[]
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
