import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/http'
import { useAuth } from '../../auth/AuthContext'

type Mode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, register } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usernameRegex = useMemo(() => /^[a-zA-Z0-9_]+$/, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return

    setError(null)

    if (!usernameRegex.test(username)) {
      setError('帳號僅能包含英文字母、數字與底線')
      return
    }

    setLoading(true)
    try {
      if (mode === 'register') {
        await register(username, password)
        setMode('login')
        setPassword('')
        return
      }

      await login(username, password)
      navigate('/dashboard', { replace: true })
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const detail = e.detail
        setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
      } else if (e instanceof Error) {
        setError(e.message)
      } else {
        setError('系統暫時無法使用')
      }
    } finally {
      setTimeout(() => setLoading(false), 600)
    }
  }

  return (
    <div
      className={
        'min-h-screen bg-gradient-to-br ' +
        (mode === 'login'
          ? 'from-slate-900 via-blue-950 to-indigo-900'
          : 'from-purple-950 via-pink-950 to-rose-950')
      }
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <div className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
          <div className="text-center">
            <div className="text-xl font-semibold text-white">{mode === 'login' ? '登入' : '註冊'}</div>
            <div className="mt-1 text-sm text-white/70">
              {mode === 'login' ? '輸入帳號密碼登入系統' : '建立新帳號以登入系統'}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80">Username</label>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none ring-0 placeholder:text-white/30 focus:border-white/30"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={32}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80">Password</label>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none ring-0 placeholder:text-white/30 focus:border-white/30"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={64}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              {mode === 'register' ? (
                <div className="mt-2 text-xs text-white/60">
                  密碼要求建議：至少 8 字元、含大小寫與數字
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loading}
              className={
                'w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ' +
                (mode === 'login'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-purple-600 hover:bg-purple-700')
              }
            >
              {mode === 'login' ? (loading ? '登入中…' : 'Login') : loading ? '註冊中…' : 'Register'}
            </button>

            <div className="text-center text-sm text-white/70">
              {mode === 'login' ? (
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => {
                    setMode('register')
                    setError(null)
                  }}
                >
                  沒有帳號？註冊
                </button>
              ) : (
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => {
                    setMode('login')
                    setError(null)
                  }}
                >
                  已有帳號？登入
                </button>
              )}
            </div>

            {error ? <div className="text-center text-sm text-rose-200">{error}</div> : null}
          </form>
        </div>
      </div>
    </div>
  )
}
