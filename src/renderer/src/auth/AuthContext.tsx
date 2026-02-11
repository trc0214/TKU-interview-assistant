import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '../api/types'
import * as authApi from '../api/auth'
import { clearTokens, getAccessToken, setTokens } from './storage'

type AuthState = {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider(props: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const token = getAccessToken()
      if (!token) {
        if (!cancelled) {
          setUser(null)
          setLoading(false)
        }
        return
      }

      try {
        const me = await authApi.me()
        if (!cancelled) setUser(me)
      } catch {
        clearTokens()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(username: string, password: string) {
        const tokens = await authApi.login(username, password)
        setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? null })
        const me = await authApi.me()
        setUser(me)
      },
      async register(username: string, password: string) {
        await authApi.register(username, password)
      },
      logout() {
        clearTokens()
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
