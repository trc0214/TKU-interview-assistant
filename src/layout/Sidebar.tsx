import { NavLink } from 'react-router-dom'

const navItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: '職缺管理', to: '/jobs' },
  { label: '履歷管理', to: '/resumes' },
  { label: '面試管理', to: '/interviews' },
  { label: 'AI 分析結果', to: '/ai-analysis' },
  { label: '系統設定', to: '/settings' },
]

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="flex h-14 items-center px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">AI 面試輔助系統</div>
          <div className="truncate text-xs text-slate-500">HR Dashboard</div>
        </div>
      </div>
      <nav className="px-2 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                'flex items-center rounded-md px-3 py-2 text-sm',
                isActive
                  ? 'bg-slate-100 font-medium text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              ].join(' ')
            }
            end={item.to === '/dashboard'}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
