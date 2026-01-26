import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { deleteInterview, listInterviews } from '../../api/interviews'
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

export function InterviewsListPage() {
  const [items, setItems] = useState<Interview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  async function refresh() {
    try {
      setError(null)
      const data = await listInterviews()
      setItems(data)
    } catch (e: any) {
      setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
      setItems([])
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">面試管理</div>
          <div className="mt-1 text-sm text-slate-600">排程、紀錄與決策</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
        </div>
        <Link
          to="/interviews/new"
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          新增面試
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">候選人</th>
                <th className="px-4 py-3">職缺</th>
                <th className="px-4 py-3">時間</th>
                <th className="px-4 py-3">狀態</th>
                <th className="px-4 py-3">面試官</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(items ?? []).map((it) => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{it.candidateName ?? `resume-${it.resumeId}`}</div>
                    <div className="mt-1 text-xs text-slate-500">interview-{it.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{it.jobTitle ?? `job-${it.jobId}`}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {it.scheduledAt ? new Date(it.scheduledAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={statusLabel(it.status)} tone={statusTone(it.status)} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{it.interviewer || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/interviews/${it.id}`}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        查看
                      </Link>
                      <Link
                        to={`/interviews/${it.id}/edit`}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        編輯
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === it.id}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={async () => {
                          if (!confirm('確定要刪除此面試紀錄？')) return
                          try {
                            setBusyId(it.id)
                            await deleteInterview(it.id)
                            await refresh()
                          } catch (e: any) {
                            setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '刪除失敗')
                          } finally {
                            setBusyId(null)
                          }
                        }}
                      >
                        {busyId === it.id ? '刪除中…' : '刪除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!items?.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-600" colSpan={6}>
                    尚無面試資料。你可以先到「履歷管理」建立履歷，再回來建立面試。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
