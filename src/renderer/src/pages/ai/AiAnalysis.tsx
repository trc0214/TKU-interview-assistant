import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { ProgressBar } from '../../components/ProgressBar'
import { createAnalysis, listAnalyses, listAnalysisHistory } from '../../api/aiAnalyses'
import { getResume } from '../../api/resumes'
import type { AIAnalysis, AIAnalysisHistory, Resume } from '../../api/types'

type SortMode = 'date_desc' | 'date_asc' | 'score_desc' | 'score_asc'

function sortByMode<T extends { createdAt: string; overallScore: number }>(items: T[], mode: SortMode): T[] {
  const sorted = [...items]
  if (mode === 'date_desc') {
    sorted.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    return sorted
  }
  if (mode === 'date_asc') {
    sorted.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    return sorted
  }
  if (mode === 'score_desc') {
    sorted.sort((left, right) => right.overallScore - left.overallScore || Date.parse(right.createdAt) - Date.parse(left.createdAt))
    return sorted
  }
  sorted.sort((left, right) => left.overallScore - right.overallScore || Date.parse(left.createdAt) - Date.parse(right.createdAt))
  return sorted
}

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
  const [history, setHistory] = useState<AIAnalysisHistory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [extraConditions, setExtraConditions] = useState('')
  const [rebusy, setRebusy] = useState(false)
  const [listSortMode, setListSortMode] = useState<SortMode>('date_desc')
  const [historySortMode, setHistorySortMode] = useState<SortMode>('date_desc')

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

        const historyItems = await listAnalysisHistory({ resumeId: r.id })
        if (cancelled) return
        setHistory(historyItems)

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
        setHistory([])
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    if (resumeId) {
      setAnalyses(null)
      setHistory([])
      loadDetail()
    } else {
      setResume(null)
      setAnalysis(null)
      setHistory([])
      loadList()
    }

    return () => {
      cancelled = true
    }
  }, [resumeId, numericResumeId])

  async function reanalyze() {
    if (!resume) return
    try {
      setRebusy(true)
      setError(null)
      const created = await createAnalysis({
        jobId: resume.jobId,
        resumeId: resume.id,
        force: true,
        extraConditions: extraConditions.trim() ? extraConditions.trim() : undefined,
      })
      setAnalysis(created)
      const historyItems = await listAnalysisHistory({ resumeId: resume.id })
      setHistory(historyItems)
    } catch (e: any) {
      setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '重新分析失敗')
    } finally {
      setRebusy(false)
    }
  }

  const scores = useMemo(() => {
    const overall = analysis?.overallScore ?? 0
    return {
      overall,
      professional: analysis?.professionalScore ?? 0,
      communication: analysis?.communicationScore ?? 0,
      problemSolving: analysis?.problemSolvingScore ?? 0,
    }
  }, [analysis])

  const comparison = useMemo(() => {
    const byDateDesc = sortByMode(history, 'date_desc')
    const latest = byDateDesc[0] ?? null
    const previous = byDateDesc[1] ?? null
    if (!latest || !previous) return null
    return {
      latest,
      previous,
      overallDelta: latest.overallScore - previous.overallScore,
      professionalDelta: latest.professionalScore - previous.professionalScore,
      communicationDelta: latest.communicationScore - previous.communicationScore,
      problemSolvingDelta: latest.problemSolvingScore - previous.problemSolvingScore,
    }
  }, [history])

  const sortedAnalyses = useMemo(() => sortByMode(analyses ?? [], listSortMode), [analyses, listSortMode])
  const sortedHistory = useMemo(() => sortByMode(history, historySortMode), [history, historySortMode])

  function formatDelta(value: number) {
    if (value === 0) return '持平'
    return `${value > 0 ? '+' : ''}${value}`
  }

  if (!resumeId) {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xl font-semibold text-slate-900">AI 分析結果</div>
          <div className="mt-1 text-sm text-slate-600">最近的分析紀錄</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600" htmlFor="analysis-sort-mode">排序</label>
          <select
            id="analysis-sort-mode"
            value={listSortMode}
            onChange={(event) => setListSortMode(event.target.value as SortMode)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="date_desc">日期（新 → 舊）</option>
            <option value="date_asc">日期（舊 → 新）</option>
            <option value="score_desc">分數（高 → 低）</option>
            <option value="score_asc">分數（低 → 高）</option>
          </select>
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
                {sortedAnalyses.map((a) => (
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
                {!sortedAnalyses.length ? (
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
          {rebusy ? <div className="mt-2 text-xs text-slate-500">重新分析中…</div> : null}
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">重新分析（可加入附加條件）</div>
            <div className="mt-1 text-sm text-slate-600">
              當面試官臨時增加篩選重點時，可在這裡補充，並強制 AI 重新產生分析。
            </div>
          </div>
          <button
            type="button"
            onClick={reanalyze}
            disabled={busy || rebusy}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            重新分析
          </button>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-slate-700">附加條件（選填）</label>
          <textarea
            value={extraConditions}
            onChange={(e) => setExtraConditions(e.target.value)}
            rows={3}
            placeholder="例：必須有 Docker / Kubernetes 經驗、近一年有實際帶團隊經驗、能配合每週至少 2 天到辦公室…"
            className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
          <div className="mt-2 text-xs text-slate-500">提示：若你已修改職缺內容（必要技能/加分條件/描述），也建議按一次重新分析。</div>
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

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">分析歷史比較</div>
              <div className="mt-1 text-sm text-slate-600">顯示最新一次分析與前一次分析的差異，方便確認重新分析是否真的改變判讀。</div>
            </div>
            <div className="text-xs text-slate-500">共 {history.length} 筆歷史</div>
          </div>

          {comparison ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500">最新分析</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{new Date(comparison.latest.createdAt).toLocaleString()}</div>
                  <div className="mt-2 text-sm text-slate-700">{comparison.latest.summary || '無摘要'}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold text-slate-500">前一次分析</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{new Date(comparison.previous.createdAt).toLocaleString()}</div>
                  <div className="mt-2 text-sm text-slate-700">{comparison.previous.summary || '無摘要'}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">指標</th>
                      <th className="px-4 py-3">最新</th>
                      <th className="px-4 py-3">前次</th>
                      <th className="px-4 py-3">差異</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[
                      ['綜合分數', comparison.latest.overallScore, comparison.previous.overallScore, comparison.overallDelta],
                      ['專業能力', comparison.latest.professionalScore, comparison.previous.professionalScore, comparison.professionalDelta],
                      ['溝通能力', comparison.latest.communicationScore, comparison.previous.communicationScore, comparison.communicationDelta],
                      ['問題解決', comparison.latest.problemSolvingScore, comparison.previous.problemSolvingScore, comparison.problemSolvingDelta],
                    ].map(([label, latest, previous, delta]) => (
                      <tr key={label as string}>
                        <td className="px-4 py-3 font-medium text-slate-900">{label}</td>
                        <td className="px-4 py-3 text-slate-700">{latest}%</td>
                        <td className="px-4 py-3 text-slate-700">{previous}%</td>
                        <td className={`px-4 py-3 font-medium ${Number(delta) > 0 ? 'text-emerald-600' : Number(delta) < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                          {formatDelta(Number(delta))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-md bg-slate-50 p-4 text-sm text-slate-600">至少需要兩筆分析紀錄，才能比較新舊差異。你可以先使用上方的「重新分析」建立第二筆結果。</div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">歷史時間軸</div>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600" htmlFor="history-sort-mode">排序</label>
            <select
              id="history-sort-mode"
              value={historySortMode}
              onChange={(event) => setHistorySortMode(event.target.value as SortMode)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            >
              <option value="date_desc">日期（新 → 舊）</option>
              <option value="date_asc">日期（舊 → 新）</option>
              <option value="score_desc">分數（高 → 低）</option>
              <option value="score_asc">分數（低 → 高）</option>
            </select>
          </div>
          <div className="mt-4 space-y-3">
            {sortedHistory.length ? (
              sortedHistory.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">{index === 0 ? '目前排序首筆' : `歷史紀錄 ${sortedHistory.length - index}`}</div>
                    <Badge label={`${item.overallScore}%`} tone={scoreToTone(item.overallScore)} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</div>
                  <div className="mt-3 text-sm text-slate-700">{item.summary || '無摘要'}</div>
                </div>
              ))
            ) : (
              <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">目前還沒有分析歷史。</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
