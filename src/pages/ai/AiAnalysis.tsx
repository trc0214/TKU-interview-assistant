import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { ProgressBar } from '../../components/ProgressBar'
import { createAnalysis, listAnalyses } from '../../api/aiAnalyses'
import { getResume } from '../../api/resumes'
import type { AIAnalysis, Resume } from '../../api/types'

function scoreToTone(score: number) {
  if (score >= 85) return 'success' as const
  if (score >= 70) return 'warning' as const
  return 'danger' as const
}

export function AiAnalysisPage() {
  const { resumeId } = useParams()
  const numericResumeId = resumeId ? Number(resumeId) : null
  const [resume, setResume] = useState<Resume | null>(null)
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [analyses, setAnalyses] = useState<AIAnalysis[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadList() {
      try {
        setError(null)
        const data = await listAnalyses()
        if (cancelled) return
        setAnalyses(data)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
        setAnalyses([])
      }
    }

    async function loadDetail() {
      if (!numericResumeId || !Number.isFinite(numericResumeId)) {
        setResume(null)
        setAnalysis(null)
        return
      }

      try {
        setBusy(true)
        setError(null)
        const r = await getResume(numericResumeId)
        if (cancelled) return
        setResume(r)

        // Try to use existing latest analysis first
        const existing = await listAnalyses({ resumeId: r.id })
        if (cancelled) return
        if (existing.length) {
          setAnalysis(existing[0])
          return
        }

        // Create one if none exists
        const created = await createAnalysis({ jobId: r.jobId, resumeId: r.id })
        if (cancelled) return
        setAnalysis(created)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
        setResume(null)
        setAnalysis(null)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    if (resumeId) {
      setAnalyses(null)
      loadDetail()
    } else {
      setResume(null)
      setAnalysis(null)
      loadList()
    }

    return () => {
      cancelled = true
    }
  }, [resumeId, numericResumeId])

  const scores = useMemo(() => {
    const overall = analysis?.overallScore ?? 0
    return {
      overall,
      professional: analysis?.professionalScore ?? 0,
      communication: analysis?.communicationScore ?? 0,
      problemSolving: analysis?.problemSolvingScore ?? 0,
    }
  }, [analysis])

  if (!resumeId) {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xl font-semibold text-slate-900">AI 分析結果</div>
          <div className="mt-1 text-sm text-slate-600">最近的分析紀錄</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">分析時間</th>
                  <th className="px-4 py-3">Resume ID</th>
                  <th className="px-4 py-3">Job ID</th>
                  <th className="px-4 py-3">綜合分數</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(analyses ?? []).map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{new Date(a.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{a.resumeId}</td>
                    <td className="px-4 py-3 text-slate-700">{a.jobId}</td>
                    <td className="px-4 py-3">
                      <Badge label={`${a.overallScore}%`} tone={scoreToTone(a.overallScore)} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/ai-analysis/${a.resumeId}`}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        查看
                      </Link>
                    </td>
                  </tr>
                ))}
                {!analyses?.length ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-slate-600" colSpan={5}>
                      尚無分析紀錄。請到「履歷管理」建立履歷後，在履歷詳情進入分析頁。
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

  if (!resume) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="text-sm font-medium text-slate-900">找不到履歷</div>
        <div className="mt-2 text-sm text-slate-600">{error ?? '資料不存在或尚未載入。'}</div>
        <div className="mt-4">
          <Link to="/resumes" className="text-sm text-slate-700 hover:text-slate-900 hover:underline">
            返回履歷列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">AI 面試分析結果</div>
          <div className="mt-1 text-sm text-slate-600">候選人：{resume.candidateName}</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
          {busy ? <div className="mt-2 text-xs text-slate-500">分析中/載入中…</div> : null}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/resumes/${resume.id}`}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            返回履歷
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">AI 綜合評分</div>
            <div className="mt-1 text-sm text-slate-600">依履歷與職缺關聯度推估</div>
          </div>
          <div className="flex items-center gap-3">
            <Badge label={`${scores.overall}%`} tone={scoreToTone(scores.overall)} />
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar value={scores.overall} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">專業能力</div>
          <div className="mt-4 space-y-2">
            <ProgressBar value={scores.professional} />
            <div className="text-sm font-medium text-slate-900 tabular-nums">{scores.professional}%</div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">溝通能力</div>
          <div className="mt-4 space-y-2">
            <ProgressBar value={scores.communication} />
            <div className="text-sm font-medium text-slate-900 tabular-nums">{scores.communication}%</div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">問題解決能力</div>
          <div className="mt-4 space-y-2">
            <ProgressBar value={scores.problemSolving} />
            <div className="text-sm font-medium text-slate-900 tabular-nums">{scores.problemSolving}%</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="text-sm font-semibold text-slate-900">AI 建議摘要</div>
        <div className="mt-3 text-sm text-slate-700">{analysis?.summary ?? resume.aiSummary ?? '尚未產生摘要。'}</div>

        {analysis?.suggestedQuestions?.length ? (
          <div className="mt-6">
            <div className="text-sm font-semibold text-slate-900">建議面試問題</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {analysis.suggestedQuestions.map((q) => (
                <li key={q} className="rounded-md bg-slate-50 px-3 py-2">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
          本分析結果僅供招募人員參考，最終決策由人類負責。
        </div>
      </div>
    </div>
  )
}
