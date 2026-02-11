import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { getResume } from '../../api/resumes'
import type { Resume } from '../../api/types'
import { formatResumeStatus } from '../../utils/format'

export function ResumeDetailPage() {
  const { resumeId } = useParams()
  const numericId = Number(resumeId)
  const [resume, setResume] = useState<Resume | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!Number.isFinite(numericId)) {
        setResume(null)
        setError('無效的 resumeId')
        return
      }
      try {
        setError(null)
        const data = await getResume(numericId)
        if (cancelled) return
        setResume(data)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
        setResume(null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [numericId])

  if (!resume) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="text-sm font-medium text-slate-900">找不到履歷</div>
        {error ? <div className="mt-2 text-sm text-rose-600">{error}</div> : null}
        <div className="mt-4">
          <Link to="/resumes" className="text-sm text-slate-700 hover:text-slate-900 hover:underline">
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">履歷詳情</div>
          <div className="mt-1 text-sm text-slate-600">{resume.candidateName} / {resume.appliedJobTitle}</div>
        </div>
        <Link
          to="/resumes"
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          返回列表
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">應徵者基本資料</div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">姓名</dt>
              <dd className="font-medium text-slate-900">{resume.candidateName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">學歷</dt>
              <dd className="font-medium text-slate-900">{resume.education}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">年資</dt>
              <dd className="font-medium text-slate-900">{resume.yearsExp} 年</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">履歷狀態</dt>
              <dd>
                <Badge
                  label={formatResumeStatus(resume.status)}
                  tone={resume.status === 'received' ? 'info' : resume.status === 'analyzed' ? 'warning' : 'success'}
                />
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <div className="text-sm font-semibold text-slate-900">技能清單</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {resume.skills.map((s) => (
                <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">履歷摘要（AI 分析摘要）</div>
          <div className="mt-3 text-sm text-slate-700">{resume.aiSummary ?? '尚未產生 AI 分析摘要。'}</div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-slate-900">與職缺的匹配重點</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {((resume.matchHighlights ?? []).length
                ? resume.matchHighlights
                : ['尚未產生匹配重點（請先進行 AI 分析）']
              ).map((item) => (
                <li key={item} className="rounded-md bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <Link
              to={`/ai-analysis/${resume.id}`}
              className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              前往 AI 面試分析
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
