import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Multi-tenant pilot: a tenant is identified by the customer's own RelayDance
// API key. Renders bill to their balance; their orders, talents and media live
// under DATA_ROOT/tenants/<id>. In demo mode (ARIA_MODE unset) there is a single
// "default" tenant that keeps the original on-disk layout.

export const PILOT = process.env.ARIA_MODE === 'pilot'
export const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), 'data')
const SESSIONS_PATH = path.join(DATA_ROOT, 'sessions.json')
const COOKIE = 'aria_session'

export type Tenant = {
  id: string
  relaydanceKey?: string
  dataDir: string
  mediaDir: string
  mediaUrlBase: string
}

export function tenantIdFor(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
}

export function defaultTenant(): Tenant {
  return {
    id: 'default',
    relaydanceKey: process.env.RELAYDANCE_API_KEY,
    dataDir: path.join(process.cwd(), 'data'),
    mediaDir: path.join(process.cwd(), 'public', 'media'),
    mediaUrlBase: '/m',
  }
}

export function tenantForKey(key: string): Tenant {
  const id = tenantIdFor(key)
  const dataDir = path.join(DATA_ROOT, 'tenants', id)
  const mediaDir = path.join(dataDir, 'media')
  fs.mkdirSync(mediaDir, { recursive: true })
  return { id, relaydanceKey: key, dataDir, mediaDir, mediaUrlBase: '/m' }
}

// ---------- sessions (server-side map, cookie carries only an opaque id) ----------

type SessionMap = Record<string, { key: string; createdAt: number }>

function readSessions(): SessionMap {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf-8'))
  } catch {
    return {}
  }
}
function writeSessions(m: SessionMap) {
  fs.mkdirSync(DATA_ROOT, { recursive: true })
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(m, null, 1))
}

export function createSession(key: string): string {
  const sid = crypto.randomBytes(24).toString('base64url')
  const m = readSessions()
  m[sid] = { key, createdAt: Date.now() }
  writeSessions(m)
  return sid
}

export function destroySession(sid: string) {
  const m = readSessions()
  delete m[sid]
  writeSessions(m)
}

function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

export function sessionCookie(sid: string, clear = false) {
  const base = `${COOKIE}=${clear ? '' : sid}; Path=/; HttpOnly; SameSite=Lax`
  return clear ? `${base}; Max-Age=0` : `${base}; Max-Age=${60 * 60 * 24 * 30}`
}

/** Resolve the tenant for a request. Demo mode always returns the default tenant. */
export function tenantFromRequest(req: Request): Tenant | null {
  if (!PILOT) return defaultTenant()
  const sid = cookieValue(req, COOKIE)
  if (!sid) return null
  const s = readSessions()[sid]
  if (!s) return null
  return tenantForKey(s.key)
}

/** Validate a RelayDance key by listing models with it. */
export async function validateRelaydanceKey(key: string): Promise<boolean> {
  if (!/^sk-[A-Za-z0-9]{20,}$/.test(key)) return false
  try {
    const r = await fetch('https://relaydance.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    })
    return r.status === 200
  } catch {
    return false
  }
}
