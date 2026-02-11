import type { AuthTokens, User } from './types'
import { request } from './http'

export async function register(username: string, password: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/register', {
    method: 'POST',
    body: { username, password },
  })
}

export async function login(username: string, password: string): Promise<AuthTokens> {
  return request<AuthTokens>('/auth/login', {
    method: 'POST',
    body: { username, password },
  })
}

export async function me(): Promise<User> {
  return request<User>('/auth/me')
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  return request<AuthTokens>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  })
}
