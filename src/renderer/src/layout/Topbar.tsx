import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useLang } from '../i18n/useLang'
import { useLanguage } from '../i18n/LanguageProvider'

export function Topbar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const t = useLang()
  const { lang, setLang } = useLanguage()

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{t.topbarTitle}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            onClick={() => setLang('zh')}
            disabled={lang === 'zh'}
          >
            {t.languageZh}
          </button>
          <button
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            onClick={() => setLang('en')}
            disabled={lang === 'en'}
          >
            {t.languageEn}
          </button>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-slate-900">{user?.username ?? '—'}</div>
          <div className="text-xs text-slate-500">{t.topbarSignedIn}</div>
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
          {t.topbarLogout}
        </button>
      </div>
    </header>
  )
}
