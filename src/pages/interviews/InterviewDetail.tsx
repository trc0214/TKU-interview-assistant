import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { getInterview } from '../../api/interviews'
import type { Interview } from '../../api/types'

function statusLabel(status: Interview['status']) {
  switch (status) {
    case 'scheduled':
      return '已排程'
    case 'completed':
      return '已完成'
    case 'canceled':
      return '已取消'
    default:
      return '—'
  }
}

function statusTone(status: Interview['status']) {
  switch (status) {
    case 'scheduled':
      return 'info' as const
    case 'completed':
      return 'success' as const
    case 'canceled':
      return 'default' as const
    default:
      return 'default' as const
  }
}

export function InterviewDetailPage() {
  const { interviewId } = useParams()
  const numericId = Number(interviewId)

  const [item, setItem] = useState<Interview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!Number.isFinite(numericId)) {
        setError('無效的 interviewId')
        setItem(null)
        return
      }
      try {
        setError(null)
        const data = await getInterview(numericId)
        if (cancelled) return
        setItem(data)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
        setItem(null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [numericId])

  if (!item) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="text-sm font-medium text-slate-900">找不到面試</div>
        <div className="mt-2 text-sm text-slate-600">{error ?? '資料不存在或尚未載入。'}</div>
        <div className="mt-4">
          <Link to="/interviews" className="text-sm text-slate-700 hover:text-slate-900 hover:underline">
            返回面試管理
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">面試詳情</div>
          <div className="mt-1 text-sm text-slate-600">
            {item.candidateName ?? `resume-${item.resumeId}`} / {item.jobTitle ?? `job-${item.jobId}`}
          </div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/interviews/${item.id}/edit`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            編輯
          </Link>
          <Link
            to="/interviews"
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            返回
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">面試紀錄</div>
          <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.notes || '—'}</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">面試資訊</div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">狀態</dt>
              <dd>
                <Badge label={statusLabel(item.status)} tone={statusTone(item.status)} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">時間</dt>
              <dd className="font-medium text-slate-900">
                {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">輪次</dt>
              <dd className="font-medium text-slate-900">{item.interviewRound || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">面試官</dt>
              <dd className="font-medium text-slate-900">{item.interviewer || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">地點</dt>
              <dd className="font-medium text-slate-900">{item.location || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">會議連結</dt>
              <dd className="min-w-0 text-right">
                {item.meetingLink ? (
                  <a className="text-slate-900 hover:underline" href={item.meetingLink} target="_blank" rel="noreferrer">
                    開啟
                  </a>
                ) : (
                  <span className="font-medium text-slate-900">—</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">評分</dt>
              <dd className="font-medium text-slate-900">{item.rating ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">決策</dt>
              <dd className="font-medium text-slate-900">{item.decision || '—'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
