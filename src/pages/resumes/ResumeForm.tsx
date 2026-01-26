import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TagInput } from '../../components/TagInput'
import { listJobs } from '../../api/jobs'
import { createResume } from '../../api/resumes'
import type { Job } from '../../api/types'

export function ResumeFormPage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<number | ''>('')

  const [candidateName, setCandidateName] = useState('')
  const [education, setEducation] = useState('')
  const [yearsExp, setYearsExp] = useState<number>(0)
  const [skills, setSkills] = useState<string[]>([])
  const [resumeText, setResumeText] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await listJobs()
        if (cancelled) return
        setJobs(data)
        if (data.length && jobId === '') setJobId(data[0].id)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.detail ? JSON.stringify(e.detail) : e?.message ?? '載入職缺失敗')
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900">新增履歷</div>
          <div className="mt-1 text-sm text-slate-600">輸入履歷文字並連結到職缺</div>
          {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
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

              const created = await createResume({
                candidateName: candidateName.trim(),
                jobId: jobId as number,
                resumeText: resumeText.trim(),
                education,
                yearsExp,
                skills,
              })

              navigate(`/resumes/${created.id}`)
            } catch (err: any) {
              setError(err?.detail ? JSON.stringify(err.detail) : err?.message ?? '建立失敗')
            } finally {
              setSaving(false)
            }
          })()
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">應徵職缺</label>
            <select
              value={jobId}
              onChange={(e) => setJobId(Number(e.target.value))}
              className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
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
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '建立中…' : '建立'}
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
