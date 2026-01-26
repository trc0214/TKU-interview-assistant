import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { getJob } from '../../api/jobs'
import type { Job } from '../../api/types'
import { formatDate, formatJobStatus } from '../../utils/format'

export function JobDetailPage() {
  const { jobId } = useParams()
  const numericId = Number(jobId)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!Number.isFinite(numericId)) {
        setJob(null)
        setError('無效的 jobId')
        return
      }
      try {
        setError(null)
        const data = await getJob(numericId)
        if (cancelled) return
        setJob(data)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
        setJob(null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [numericId])

  if (!job) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="text-sm font-medium text-slate-900">找不到職缺</div>
        <div className="mt-1 text-sm text-slate-600">{error ?? '資料不存在或尚未載入。'}</div>
        <div className="mt-4">
          <Link to="/jobs" className="text-sm text-slate-700 hover:text-slate-900 hover:underline">
            返回職缺管理
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">職缺詳情</div>
          <div className="mt-1 text-sm text-slate-600">{job.title}</div>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/jobs/${job.id}/edit`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            編輯
          </Link>
          <Link
            to="/jobs"
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            返回
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">工作內容</div>
          <div className="mt-2 text-sm text-slate-700">{job.description}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-slate-600">必要技能</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {job.requiredSkills.map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600">加分條件</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {job.niceToHave.map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">職缺資訊</div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">部門</dt>
              <dd className="font-medium text-slate-900">{job.department}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">狀態</dt>
              <dd>
                <Badge label={formatJobStatus(job.status)} tone={job.status === 'open' ? 'success' : 'default'} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">建立時間</dt>
              <dd className="font-medium text-slate-900">{formatDate(job.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">年資需求</dt>
              <dd className="font-medium text-slate-900">{job.experienceLevel} 年</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">學歷要求</dt>
              <dd className="font-medium text-slate-900">{job.education}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-md bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-600">AI 設定（展示）</div>
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>啟用 AI 履歷比對</span>
                <Badge label={job.aiResumeMatchingEnabled ? '啟用' : '停用'} tone={job.aiResumeMatchingEnabled ? 'success' : 'default'} />
              </div>
              <div className="flex items-center justify-between">
                <span>自動生成面試問題</span>
                <Badge label={job.aiQuestionGenEnabled ? '啟用' : '停用'} tone={job.aiQuestionGenEnabled ? 'success' : 'default'} />
              </div>
              <div className="mt-3 text-xs text-slate-500">AI 僅輔助，不取代人類決策</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
