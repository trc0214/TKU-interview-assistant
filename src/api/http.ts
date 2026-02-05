type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(message: string, status: number, detail: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

const DEFAULT_BASE_URL = 'http://localhost:8000/api/v1'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

function setTokens(tokens: { accessToken: string; refreshToken?: string | null }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
  if (tokens.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
}

function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

function getBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL as string | undefined
  return (value && value.trim()) || DEFAULT_BASE_URL
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function request<T>(path: string, options?: { method?: HttpMethod; body?: unknown }): Promise<T> {
  const baseUrl = getBaseUrl().replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  async function doFetch(withAuth: boolean): Promise<Response> {
    const token = getAccessToken()
    return fetch(`${baseUrl}${normalizedPath}`, {
      method: options?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(withAuth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    })
  }

  let response = await doFetch(true)

  const payload = await parseJsonSafely(response)

  if (!response.ok) {
    if (response.status === 401 && !normalizedPath.startsWith('/auth/')) {
      const refreshToken = getRefreshToken()
      if (refreshToken) {
        const refreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (refreshResponse.ok) {
          const refreshed = (await parseJsonSafely(refreshResponse)) as unknown
          if (refreshed && typeof refreshed === 'object' && 'accessToken' in refreshed) {
            const accessToken = (refreshed as { accessToken: string }).accessToken
            const refreshToken = (refreshed as { refreshToken?: string | null }).refreshToken
            if (accessToken) setTokens({ accessToken, refreshToken: refreshToken ?? null })
            response = await doFetch(true)
            const retryPayload = await parseJsonSafely(response)
            if (response.ok) return retryPayload as T
          }
        }
      }

      clearTokens()
    }

    const detail =
      payload && typeof payload === 'object' && 'detail' in payload ? (payload as { detail: unknown }).detail : payload
    throw new ApiError(`API request failed: ${response.status}`, response.status, detail)
  }

  return payload as T
}
