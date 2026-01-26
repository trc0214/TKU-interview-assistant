import { request } from './http'
import type { AIAnalysis } from './types'

export function listAnalyses(params?: { jobId?: number; resumeId?: number }): Promise<AIAnalysis[]> {
  const parts: string[] = []
  if (params?.jobId) parts.push(`job_id=${encodeURIComponent(params.jobId)}`)
  if (params?.resumeId) parts.push(`resume_id=${encodeURIComponent(params.resumeId)}`)
  const qs = parts.length ? `?${parts.join('&')}` : ''
  return request<AIAnalysis[]>(`/ai-analyses${qs}`)
}

export function createAnalysis(data: { jobId: number; resumeId: number; force?: boolean }): Promise<AIAnalysis> {
  return request<AIAnalysis>('/ai-analyses', { method: 'POST', body: data })
}
