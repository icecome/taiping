import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv, SessionUser } from '../env'
import { sha256 } from './crypto'

const COOKIE = 'tp_session'

function secretOf(c: Context<AppEnv>): string {
  return c.env.SESSION_SECRET || 'dev-session-secret-change-me'
}

function b64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(input: string): string {
  const pad = input.replace(/-/g, '+').replace(/_/g, '/')
  return atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
}

export async function createSessionToken(user: SessionUser, secret: string): Promise<string> {
  const payload = `${user.id}.${user.name}.${user.role}`
  const sig = await sha256(payload + secret)
  return `${b64urlEncode(payload)}.${sig}`
}

export async function parseSessionToken(token: string, secret: string): Promise<SessionUser | null> {
  const [b64, sig] = token.split('.')
  if (!b64 || !sig) return null
  let payload: string
  try {
    payload = b64urlDecode(b64)
  } catch {
    return null
  }
  if ((await sha256(payload + secret)) !== sig) return null
  const [idRaw, name, role] = payload.split('.')
  const id = Number(idRaw)
  if (!Number.isInteger(id) || !name || !role) return null
  return {
    id,
    name,
    displayName: name,
    email: '',
    role: role as SessionUser['role'],
  }
}

export async function setSession(c: Context<AppEnv>, user: SessionUser): Promise<void> {
  const token = await createSessionToken(user, secretOf(c))
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: c.env.APP_ENV === 'production',
    maxAge: 60 * 60 * 24 * 14,
  })
}

export function clearSession(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE, { path: '/' })
}

export async function getSessionUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, COOKIE)
  if (!token) return null
  return parseSessionToken(token, secretOf(c))
}
