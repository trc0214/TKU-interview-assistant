export type JobStatus = 'open' | 'closed'

export type Job = {
  id: string
  title: string
  department: string
  description: string
  requiredSkills: string[]
  niceToHave: string[]
  status: JobStatus
  createdAt: string
  experienceLevel: '0-1' | '2-3' | '4-6' | '7+'
  education: '不限' | '大學' | '碩士' | '博士'
  aiResumeMatchingEnabled: boolean
  aiQuestionGenEnabled: boolean
}

export const jobsMock: Job[] = [
  {
    id: 'job-001',
    title: '前端工程師（React）',
    department: '技術研發部',
    description: '負責企業內部招募系統前端介面開發與維護。',
    requiredSkills: ['React', 'TypeScript', 'REST API'],
    niceToHave: ['Tailwind CSS', 'Vitest', '可用性/無障礙'],
    status: 'open',
    createdAt: '2026-01-10',
    experienceLevel: '2-3',
    education: '大學',
    aiResumeMatchingEnabled: true,
    aiQuestionGenEnabled: true,
  },
  {
    id: 'job-002',
    title: '後端工程師（Node.js）',
    department: '平台服務部',
    description: '負責 API 與資料服務開發、系統效能與可靠度優化。',
    requiredSkills: ['Node.js', 'SQL', '系統設計'],
    niceToHave: ['Docker', 'Kubernetes', 'Observability'],
    status: 'open',
    createdAt: '2026-01-08',
    experienceLevel: '4-6',
    education: '大學',
    aiResumeMatchingEnabled: true,
    aiQuestionGenEnabled: false,
  },
  {
    id: 'job-003',
    title: '資料分析師',
    department: '數據策略部',
    description: '負責商業數據分析、指標設計與報表自動化。',
    requiredSkills: ['SQL', 'Python', '資料視覺化'],
    niceToHave: ['統計', '實驗設計', '溝通能力'],
    status: 'closed',
    createdAt: '2025-12-22',
    experienceLevel: '2-3',
    education: '大學',
    aiResumeMatchingEnabled: false,
    aiQuestionGenEnabled: false,
  },
]

export function getJobById(jobId: string | undefined) {
  if (!jobId) return undefined
  return jobsMock.find((j) => j.id === jobId)
}
