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

function getBaseUrl(): string {
  const value = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined
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

  const response = await fetch(`${baseUrl}${normalizedPath}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const payload = await parseJsonSafely(response)

  if (!response.ok) {
    const detail = (payload as any)?.detail ?? payload
    throw new ApiError(`API request failed: ${response.status}`, response.status, detail)
  }

  return payload as T
}
