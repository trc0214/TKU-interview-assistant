import type { TranscriptEntry } from './transcript'

export type InterviewAssistantDraft = {
  interviewId?: number
  startedAt: number | null
  updatedAt: number
  transcriptEntries: TranscriptEntry[]
  partialText: string
  notes: string
}

function draftKey(interviewId?: number): string {
  return `interview-assistant:draft:${interviewId ?? 'adhoc'}`
}

export function loadDraft(interviewId?: number): InterviewAssistantDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(interviewId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as InterviewAssistantDraft
    if (!parsed || !Array.isArray(parsed.transcriptEntries)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveDraft(draft: InterviewAssistantDraft): void {
  try {
    window.localStorage.setItem(draftKey(draft.interviewId), JSON.stringify(draft))
  } catch {
    // ignore storage failures
  }
}

export function clearDraft(interviewId?: number): void {
  try {
    window.localStorage.removeItem(draftKey(interviewId))
  } catch {
    // ignore storage failures
  }
}
