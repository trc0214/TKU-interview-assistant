import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TagInput } from '../../components/TagInput'
import { listJobs } from '../../api/jobs'
import { createResume, getResume, parseResumePdf, updateResume } from '../../api/resumes'
import type { Job, Resume } from '../../api/types'

export function ResumeFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const { resumeId } = useParams()
  const numericId = Number(resumeId)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<number | ''>('')
  const [existing, setExisting] = useState<Resume | null>(null)

  const [candidateName, setCandidateName] = useState('')
  const [education, setEducation] = useState('')
  const [yearsExp, setYearsExp] = useState<number>(0)
  const [skills, setSkills] = useState<string[]>([])
  const [resumeText, setResumeText] = useState('')

  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parsedFileName, setParsedFileName] = useState<string | null>(null)
  const [parsedPageCount, setParsedPageCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadResume() {
      if (mode !== 'edit') return
      if (!Number.isFinite(numericId)) {
        setLoadError('無效的 resumeId')
        setExisting(null)
        return
      }
      try {
        setLoadError(null)
        const data = await getResume(numericId)
        if (cancelled) return
        setExisting(data)
      } catch (e: any) {
        if (cancelled) return
        setLoadError(e?.detail ? JSON.stringify(e.detail) : (e?.message ?? '載入履歷失敗'))
        setExisting(null)
      }
    }
    loadResume()
    return () => {
      cancelled = true
    }
  }, [mode, numericId])

  const seed = useMemo(() => (mode === 'edit' ? existing : null), [existing, mode])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await listJobs()
        if (cancelled) return
        setJobs(data)
        if (!data.length) return
        if (seed) {
          setJobId(seed.jobId)
        } else if (jobId === '') {
          setJobId(data[0].id)
        }
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : (e?.message ?? '載入職缺失敗'))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [jobId, seed])

  useEffect(() => {
    if (!seed) return
    setCandidateName(seed.candidateName)
    setEducation(seed.education)
    setYearsExp(seed.yearsExp)
    setSkills(seed.skills)
    setResumeText(seed.resumeText)
    setJobId(seed.jobId)
    setParsedFileName(null)
    setParsedPageCount(null)
  }, [seed])

  const pageTitle = mode === 'create' ? '新增履歷' : '編輯履歷'
  const pageSubtitle =
    mode === 'create' ? '上傳 PDF 或貼上履歷文字並連結到職缺' : '更新履歷內容與應徵資訊'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">{pageTitle}</div>
          <div className="mt-1 text-sm text-slate-600">{pageSubtitle}</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
          {loadError ? <div className="mt-2 text-xs text-rose-600">{loadError}</div> : null}
        </div>
        <Link
          to="/resumes"
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          取消
        </Link>
      </div>

      <form
        className="rounded-lg border border-slate-200 bg-white p-6"
        onSubmit={(e) => {
          e.preventDefault()
          ;(async () => {
            try {
              setSaving(true)
              setError(null)
              if (!candidateName.trim()) throw new Error('請輸入應徵者姓名')
              if (!resumeText.trim()) throw new Error('請輸入履歷內容')
              if (jobId === '') throw new Error('請選擇應徵職缺')

              const payload = {
                candidateName: candidateName.trim(),
                jobId: jobId as number,
                resumeText: resumeText.trim(),
                education: education.trim(),
                yearsExp,
                skills
              }

              const saved =
                mode === 'create'
                  ? await createResume(payload)
                  : await updateResume(numericId, {
                      ...payload,
                      status: existing?.status ?? 'received'
                    })

              navigate(`/resumes/${saved.id}`)
            } catch (err: any) {
              setError(err?.detail ? JSON.stringify(err.detail) : (err?.message ?? '建立失敗'))
            } finally {
              setSaving(false)
            }
          })()
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">PDF 履歷上傳</div>
                <div className="mt-1 text-xs text-slate-600">
                  支援可選取文字的 PDF，系統會先擷取文字，再讓你補齊欄位後送出。
                </div>
              </div>
              {parsedFileName ? (
                <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                  {parsedFileName} {parsedPageCount ? `· ${parsedPageCount} 頁` : ''}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    ;(async () => {
                      try {
                        setParsing(true)
                        setError(null)
                        const parsed = await parseResumePdf(file)
                        setResumeText(parsed.extractedText)
                        setParsedFileName(parsed.filename)
                        setParsedPageCount(parsed.pageCount)
                      } catch (err: any) {
                        setError(
                          err?.detail
                            ? JSON.stringify(err.detail)
                            : (err?.message ?? 'PDF 解析失敗')
                        )
                      } finally {
                        setParsing(false)
                        event.target.value = ''
                      }
                    })()
                  }}
                />
                {parsing ? '解析中…' : '上傳 PDF 並解析'}
              </label>
              <div className="text-xs text-slate-500">
                若 PDF 無法擷取文字，仍可改用下方文字區手動貼上內容。
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">應徵職缺</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(Number(e.target.value))}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {!jobs.length ? <option value="">請先建立職缺</option> : null}
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}（{j.department}）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">應徵者姓名</label>
            <input
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="例如：王小明"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">學歷</label>
            <input
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="例如：國立大學 資工系"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">年資</label>
            <input
              type="number"
              min={0}
              value={yearsExp}
              onChange={(e) => setYearsExp(Number(e.target.value))}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="md:col-span-2">
            <TagInput label="技能清單" value={skills} onChange={setSkills} />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">履歷內容（文字）</label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={8}
              className="mt-2 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="貼上或輸入履歷內容…"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || parsing}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '儲存中…' : mode === 'create' ? '建立' : '更新'}
          </button>
          <Link
            to="/resumes"
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  )
}
