import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { StatCard } from '../components/StatCard'
import { Badge } from '../components/Badge'
import { ProgressBar } from '../components/ProgressBar'
import { listJobs } from '../api/jobs'
import { listResumes } from '../api/resumes'
import type { Job, Resume } from '../api/types'
import { formatDate, formatJobStatus, formatResumeStatus } from '../utils/format'

export function DashboardPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [resumes, setResumes] = useState<Resume[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const [jobsData, resumesData] = await Promise.all([listJobs(), listResumes()])
        if (cancelled) return
        setJobs(jobsData)
        setResumes(resumesData)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
        setJobs([])
        setResumes([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const metrics = useMemo(() => {
    const safeJobs = jobs ?? []
    const safeResumes = resumes ?? []
    return {
      openJobs: safeJobs.filter((j) => j.status === 'open').length,
      totalResumes: safeResumes.length,
      analyzedCount: safeResumes.filter((r) => r.status !== 'received').length,
      recentJobs: [...safeJobs].slice(0, 3),
      recentResumes: [...safeResumes].slice(0, 5),
    }
  }, [jobs, resumes])

  const loading = jobs === null || resumes === null

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold text-slate-900">Dashboard</div>
        <div className="mt-1 text-sm text-slate-600">系統概覽</div>
        {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="招募中職缺數量" value={loading ? '—' : `${metrics.openJobs}`} hint="目前狀態為 招募中" />
        <StatCard title="已收到履歷數量" value={loading ? '—' : `${metrics.totalResumes}`} hint="包含已分析/已面試" />
        <StatCard title="已完成 AI 初步評估人數" value={loading ? '—' : `${metrics.analyzedCount}`} hint="履歷狀態非 已收到" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">最近新增的職缺</div>
            <Link to="/jobs" className="text-sm text-slate-600 hover:text-slate-900">
              前往職缺管理
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">職缺名稱</th>
                  <th className="px-4 py-3">部門</th>
                  <th className="px-4 py-3">狀態</th>
                  <th className="px-4 py-3">建立時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {metrics.recentJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/jobs/${job.id}`} className="font-medium text-slate-900 hover:underline">
                        {job.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{job.department}</td>
                    <td className="px-4 py-3">
                      <Badge label={formatJobStatus(job.status)} tone={job.status === 'open' ? 'success' : 'default'} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(job.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">最近收到的履歷</div>
            <Link to="/resumes" className="text-sm text-slate-600 hover:text-slate-900">
              前往履歷管理
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">應徵者</th>
                  <th className="px-4 py-3">應徵職缺</th>
                  <th className="px-4 py-3">狀態</th>
                  <th className="px-4 py-3">AI 匹配分數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {metrics.recentResumes.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/resumes/${r.id}`} className="font-medium text-slate-900 hover:underline">
                        {r.candidateName}
                      </Link>
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
                        <div className="w-28">
                          <ProgressBar value={r.aiMatchScore ?? 0} />
                        </div>
                        <div className="tabular-nums text-sm font-medium text-slate-900">{r.aiMatchScore ?? 0}%</div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
