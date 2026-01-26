export type ResumeStatus = 'received' | 'analyzed' | 'interviewed'

export type Resume = {
  id: string
  candidateName: string
  appliedJobId: string
  appliedJobTitle: string
  status: ResumeStatus
  aiMatchScore: number
  submittedAt: string
  education: string
  yearsExp: number
  skills: string[]
  aiSummary: string
  matchHighlights: string[]
}

export const resumesMock: Resume[] = [
  {
    id: 'res-001',
    candidateName: '林怡君',
    appliedJobId: 'job-001',
    appliedJobTitle: '前端工程師（React）',
    status: 'analyzed',
    aiMatchScore: 86,
    submittedAt: '2026-01-12',
    education: '國立大學 資工系',
    yearsExp: 3,
    skills: ['React', 'TypeScript', 'Testing Library', 'CSS'],
    aiSummary: '具 3 年前端經驗，專案以 React/TS 為主；對元件化與可維護性有實作經驗。',
    matchHighlights: ['React + TypeScript 經驗符合', '具測試與元件化思維', '可補強 Tailwind/設計系統實務'],
  },
  {
    id: 'res-002',
    candidateName: '陳冠宇',
    appliedJobId: 'job-002',
    appliedJobTitle: '後端工程師（Node.js）',
    status: 'received',
    aiMatchScore: 72,
    submittedAt: '2026-01-11',
    education: '私立大學 資管系',
    yearsExp: 2,
    skills: ['Node.js', 'Express', 'PostgreSQL', 'Docker'],
    aiSummary: '具 Node.js API 開發經驗，熟悉 SQL；系統設計深度中等，需看實戰案例。',
    matchHighlights: ['API 開發與 SQL 基礎良好', '具 Docker 實作', '系統設計需面試深入驗證'],
  },
  {
    id: 'res-003',
    candidateName: '張雅婷',
    appliedJobId: 'job-001',
    appliedJobTitle: '前端工程師（React）',
    status: 'interviewed',
    aiMatchScore: 91,
    submittedAt: '2026-01-07',
    education: '科技大學 資工所',
    yearsExp: 5,
    skills: ['React', 'TypeScript', 'Performance', 'Design System'],
    aiSummary: '具 5 年前端經驗，熟悉效能優化與設計系統落地；有跨團隊協作經驗。',
    matchHighlights: ['設計系統與效能經驗突出', '跨團隊溝通良好', '適合擔任核心模組負責人'],
  },
]

export function getResumeById(resumeId: string | undefined) {
  if (!resumeId) return undefined
  return resumesMock.find((r) => r.id === resumeId)
}
