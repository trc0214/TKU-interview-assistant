import { NavLink } from 'react-router-dom'
import { useLang } from '../i18n/useLang'

export function Sidebar() {
  const t = useLang()
  const navItems = [
    { label: t.navDashboard, to: '/dashboard' },
    { label: t.navJobs, to: '/jobs' },
    { label: t.navResumes, to: '/resumes' },
    { label: t.navInterviews, to: '/interviews' },
    { label: t.navAiAnalysis, to: '/ai-analysis' },
    { label: t.navMeeting, to: '/meeting' },
    { label: t.navSettings, to: '/settings' },
  ]

  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="flex h-14 items-center px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{t.topbarTitle}</div>
          <div className="truncate text-xs text-slate-500">{t.sidebarSubtitle}</div>
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
