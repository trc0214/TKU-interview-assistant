import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TagInput } from '../../components/TagInput'
import { createJob, getJob, updateJob } from '../../api/jobs'
import type { Job } from '../../api/types'

type ExperienceLevel = '0-1' | '2-3' | '4-6' | '7+'
type Education = '不限' | '大學' | '碩士' | '博士'

export function JobFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const numericId = Number(jobId)
  const [existing, setExisting] = useState<Job | null>(mode === 'edit' ? null : null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (mode !== 'edit') return
      if (!Number.isFinite(numericId)) {
        setLoadError('無效的 jobId')
        setExisting(null)
        return
      }
      try {
        setLoadError(null)
        const data = await getJob(numericId)
        if (cancelled) return
        setExisting(data)
      } catch (e: any) {
        if (cancelled) return
        setLoadError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入失敗')
        setExisting(null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [mode, numericId])

  const seed = useMemo(() => (mode === 'edit' ? existing : null), [existing, mode])

  const [title, setTitle] = useState(seed?.title ?? '')
  const [department, setDepartment] = useState(seed?.department ?? '')
  const [description, setDescription] = useState(seed?.description ?? '')
  const [requiredSkills, setRequiredSkills] = useState<string[]>(seed?.requiredSkills ?? [])
  const [niceToHave, setNiceToHave] = useState<string[]>(seed?.niceToHave ?? [])
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>((seed?.experienceLevel as any) ?? '2-3')
  const [education, setEducation] = useState<Education>((seed?.education as any) ?? '大學')
  const [aiResumeMatchingEnabled, setAiResumeMatchingEnabled] = useState(seed?.aiResumeMatchingEnabled ?? true)
  const [aiQuestionGenEnabled, setAiQuestionGenEnabled] = useState(seed?.aiQuestionGenEnabled ?? true)

  useEffect(() => {
    if (!seed) return
    setTitle(seed.title)
    setDepartment(seed.department)
    setDescription(seed.description)
    setRequiredSkills(seed.requiredSkills)
    setNiceToHave(seed.niceToHave)
    setExperienceLevel((seed.experienceLevel as any) ?? '2-3')
    setEducation((seed.education as any) ?? '大學')
    setAiResumeMatchingEnabled(seed.aiResumeMatchingEnabled)
    setAiQuestionGenEnabled(seed.aiQuestionGenEnabled)
  }, [seed])

  const pageTitle = mode === 'create' ? '新增職缺' : '編輯職缺'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">{pageTitle}</div>
          <div className="mt-1 text-sm text-slate-600">{mode === 'create' ? '建立新職缺' : '更新職缺資訊'}</div>
          {loadError ? <div className="mt-2 text-xs text-rose-600">{loadError}</div> : null}
        </div>
        <Link
          to="/jobs"
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          取消
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-6"
          onSubmit={(e) => {
            e.preventDefault()
            ;(async () => {
              try {
                setSaving(true)
                const payload = {
                  title,
                  department,
                  description,
                  requiredSkills,
                  niceToHave,
                  status: 'open' as const,
                  experienceLevel,
                  education,
                  aiResumeMatchingEnabled,
                  aiQuestionGenEnabled,
                }
                if (mode === 'create') {
                  await createJob(payload)
                } else {
                  if (!Number.isFinite(numericId)) throw new Error('無效的 jobId')
                  await updateJob(numericId, payload)
                }
                navigate('/jobs')
              } catch (err: any) {
                alert(err?.detail ? JSON.stringify(err.detail) : err?.message ?? '儲存失敗')
              } finally {
                setSaving(false)
              }
            })()
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700">職缺名稱</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="例如：前端工程師（React）"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">部門</label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="例如：技術研發部"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">年資需求</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="0-1">0-1</option>
                <option value="2-3">2-3</option>
                <option value="4-6">4-6</option>
                <option value="7+">7+</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">學歷要求</label>
              <select
                value={education}
                onChange={(e) => setEducation(e.target.value as Education)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="不限">不限</option>
                <option value="大學">大學</option>
                <option value="碩士">碩士</option>
                <option value="博士">博士</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700">工作內容</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="mt-2 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="請輸入職缺描述（多行）"
              />
            </div>
            <div className="md:col-span-2">
              <TagInput label="必要技能" value={requiredSkills} onChange={setRequiredSkills} />
            </div>
            <div className="md:col-span-2">
              <TagInput label="加分條件" value={niceToHave} onChange={setNiceToHave} />
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
              to="/jobs"
              className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              取消
            </Link>
          </div>
        </form>

        <aside className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">AI 相關設定（僅展示）</div>
          <div className="mt-4 space-y-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={aiResumeMatchingEnabled}
                onChange={(e) => setAiResumeMatchingEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
              />
              <span>
                <span className="font-medium text-slate-900">是否啟用 AI 履歷比對</span>
                <div className="mt-1 text-xs text-slate-500">將使用 AI 產生匹配分數與摘要（Mock）</div>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={aiQuestionGenEnabled}
                onChange={(e) => setAiQuestionGenEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
              />
              <span>
                <span className="font-medium text-slate-900">是否自動生成面試問題</span>
                <div className="mt-1 text-xs text-slate-500">依職缺與履歷生成建議問題（僅展示）</div>
              </span>
            </label>

            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              AI 僅輔助，不取代人類決策。
            </div>
          </div>

          {mode === 'edit' ? (
            <div className="mt-6 text-xs text-slate-500">編輯模式：{existing ? `job-${existing.id}` : '載入中/不存在'}</div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
