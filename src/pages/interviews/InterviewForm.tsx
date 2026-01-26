import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { listJobs } from '../../api/jobs'
import { listResumes } from '../../api/resumes'
import { createInterview, getInterview, updateInterview } from '../../api/interviews'
import type { Interview, Job, Resume } from '../../api/types'

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return date.toISOString()
}

export function InterviewFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const { interviewId } = useParams()
  const numericId = Number(interviewId)

  const [jobs, setJobs] = useState<Job[]>([])
  const [resumes, setResumes] = useState<Resume[]>([])

  const [jobId, setJobId] = useState<number | ''>('')
  const [resumeId, setResumeId] = useState<number | ''>('')
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [status, setStatus] = useState<Interview['status']>('scheduled')
  const [interviewRound, setInterviewRound] = useState('')
  const [interviewer, setInterviewer] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [location, setLocation] = useState('')
  const [rating, setRating] = useState<number | ''>('')
  const [decision, setDecision] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      try {
        const [jobsData, resumesData] = await Promise.all([listJobs(), listResumes()])
        if (cancelled) return
        setJobs(jobsData)
        setResumes(resumesData)
        if (mode === 'create') {
          if (jobsData.length && jobId === '') setJobId(jobsData[0].id)
          if (resumesData.length && resumeId === '') setResumeId(resumesData[0].id)
        }
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入選單失敗')
      }
    }
    loadOptions()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadExisting() {
      if (mode !== 'edit') return
      if (!Number.isFinite(numericId)) {
        setError('無效的 interviewId')
        return
      }
      try {
        setLoading(true)
        setError(null)
        const it = await getInterview(numericId)
        if (cancelled) return
        setJobId(it.jobId)
        setResumeId(it.resumeId)
        setScheduledAt(toDatetimeLocalValue(it.scheduledAt ?? null))
        setStatus(it.status)
        setInterviewRound(it.interviewRound)
        setInterviewer(it.interviewer)
        setMeetingLink(it.meetingLink)
        setLocation(it.location)
        setRating(it.rating ?? '')
        setDecision(it.decision)
        setNotes(it.notes)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadExisting()
    return () => {
      cancelled = true
    }
  }, [mode, numericId])

  const pageTitle = mode === 'create' ? '新增面試' : '編輯面試'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">{pageTitle}</div>
          <div className="mt-1 text-sm text-slate-600">建立面試排程與記錄</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
          {loading ? <div className="mt-2 text-xs text-slate-500">載入中…</div> : null}
        </div>
        <Link
          to="/interviews"
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          取消
        </Link>
      </div>

      <form
        className="rounded-lg border border-slate-200 bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault()
          ;(async () => {
            try {
              setSaving(true)
              setError(null)
              if (jobId === '' || resumeId === '') throw new Error('請選擇職缺與履歷')

              const payload = {
                jobId: jobId as number,
                resumeId: resumeId as number,
                scheduledAt: fromDatetimeLocalValue(scheduledAt),
                status,
                interviewRound,
                interviewer,
                meetingLink,
                location,
                rating: rating === '' ? null : (rating as number),
                decision,
                notes,
              }

              if (mode === 'create') {
                const created = await createInterview(payload)
                navigate(`/interviews/${created.id}`)
              } else {
                if (!Number.isFinite(numericId)) throw new Error('無效的 interviewId')
                const updated = await updateInterview(numericId, payload)
                navigate(`/interviews/${updated.id}`)
              }
            } catch (err: any) {
              setError(err?.detail ? JSON.stringify(err.detail) : err?.message ?? '儲存失敗')
            } finally {
              setSaving(false)
            }
          })()
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">職缺</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(Number(e.target.value))}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}（{j.department}）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">候選人（履歷）</label>
            <select
              value={resumeId}
              onChange={(e) => setResumeId(Number(e.target.value))}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.candidateName} / {r.appliedJobTitle ?? `job-${r.jobId}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">排程時間</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="scheduled">已排程</option>
              <option value="completed">已完成</option>
              <option value="canceled">已取消</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">面試輪次</label>
            <input
              value={interviewRound}
              onChange={(e) => setInterviewRound(e.target.value)}
              placeholder="例如：一面 / 二面 / 技術面"
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">面試官</label>
            <input
              value={interviewer}
              onChange={(e) => setInterviewer(e.target.value)}
              placeholder="例如：王主管"
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">會議連結</label>
            <input
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://..."
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">地點</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例如：線上 / 會議室 A"
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">評分（0-100）</label>
            <input
              type="number"
              min={0}
              max={100}
              value={rating}
              onChange={(e) => setRating(e.target.value === '' ? '' : Number(e.target.value))}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">決策</label>
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="">—</option>
              <option value="pass">通過</option>
              <option value="hold">保留</option>
              <option value="reject">淘汰</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">面試紀錄</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={7}
              className="mt-2 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="紀錄重點、優缺點、追問題目、結論…"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
          <Link
            to="/interviews"
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  )
}
