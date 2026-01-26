import { request } from './http'
import type { Job } from './types'

export type JobCreate = Omit<Job, 'id' | 'createdAt'>
export type JobUpdate = Partial<JobCreate>

export function listJobs(): Promise<Job[]> {
  return request<Job[]>('/jobs')
}

export function getJob(jobId: number): Promise<Job> {
  return request<Job>(`/jobs/${jobId}`)
}

export function createJob(data: JobCreate): Promise<Job> {
  return request<Job>('/jobs', { method: 'POST', body: data })
}

export function updateJob(jobId: number, data: JobUpdate): Promise<Job> {
  return request<Job>(`/jobs/${jobId}`, { method: 'PUT', body: data })
}

export function deleteJob(jobId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/jobs/${jobId}`, { method: 'DELETE' })
}
