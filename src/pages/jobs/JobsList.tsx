import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { deleteJob, listJobs } from '../../api/jobs'
import type { Job } from '../../api/types'
import { formatDate, formatJobStatus } from '../../utils/format'

export function JobsListPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  async function refresh() {
    try {
      setError(null)
      const items = await listJobs()
      setJobs(items)
    } catch (e: any) {
      setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
      setJobs([])
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">職缺管理</div>
          <div className="mt-1 text-sm text-slate-600">查看與維護所有職缺</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
        </div>
        <Link
          to="/jobs/new"
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          新增職缺
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">職缺名稱</th>
                <th className="px-4 py-3">部門</th>
                <th className="px-4 py-3">所需技能摘要</th>
                <th className="px-4 py-3">狀態</th>
                <th className="px-4 py-3">建立時間</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(jobs ?? []).map((job) => (
                <tr key={job.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{job.title}</div>
                    <div className="mt-1 text-xs text-slate-500">job-{job.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{job.department}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="line-clamp-2">{job.requiredSkills.join('、')}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={formatJobStatus(job.status)} tone={job.status === 'open' ? 'success' : 'default'} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(job.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/jobs/${job.id}`}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        查看
                      </Link>
                      <Link
                        to={`/jobs/${job.id}/edit`}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        編輯
                      </Link>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busyId === job.id}
                        onClick={async () => {
                          if (!confirm('確定要刪除此職缺？（會連同履歷/分析一起刪除）')) return
                          try {
                            setBusyId(job.id)
                            await deleteJob(job.id)
                            await refresh()
                          } catch (e: any) {
                            setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '刪除失敗')
                          } finally {
                            setBusyId(null)
                          }
                        }}
                      >
                        {busyId === job.id ? '刪除中…' : '刪除'}
                      </button>
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
