import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { ProgressBar } from '../../components/ProgressBar'
import { listResumes } from '../../api/resumes'
import type { Resume } from '../../api/types'
import { formatDate, formatResumeStatus } from '../../utils/format'

export function ResumesListPage() {
  const [resumes, setResumes] = useState<Resume[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const data = await listResumes()
        if (cancelled) return
        setResumes(data)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
        setResumes([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">履歷管理</div>
          <div className="mt-1 text-sm text-slate-600">接收履歷與查看 AI 分析</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
        </div>
        <Link
          to="/resumes/new"
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          新增履歷
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">應徵者姓名</th>
                <th className="px-4 py-3">應徵職缺</th>
                <th className="px-4 py-3">履歷狀態</th>
                <th className="px-4 py-3">AI 匹配分數</th>
                <th className="px-4 py-3">投遞時間</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(resumes ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.candidateName}</div>
                    <div className="mt-1 text-xs text-slate-500">res-{r.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.appliedJobTitle}</td>
                  <td className="px-4 py-3">
                    <Badge
                      label={formatResumeStatus(r.status)}
                      tone={r.status === 'received' ? 'info' : r.status === 'analyzed' ? 'warning' : 'success'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-32">
                        <ProgressBar value={r.aiMatchScore ?? 0} />
                      </div>
                      <div className="tabular-nums text-sm font-medium text-slate-900">{r.aiMatchScore ?? 0}%</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(r.submittedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/resumes/${r.id}`}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        查看履歷
                      </Link>
                      <Link
                        to={`/ai-analysis/${r.id}`}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        查看 AI 分析
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
