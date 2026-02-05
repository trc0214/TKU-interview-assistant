import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Topbar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">AI Interview Assistant</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium text-slate-900">{user?.username ?? '—'}</div>
          <div className="text-xs text-slate-500">Signed in</div>
        </div>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
          {(user?.username?.slice(0, 2) ?? 'U').toUpperCase()}
        </div>
        <button
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
        >
          登出
        </button>
      </div>
    </header>
  )
}
