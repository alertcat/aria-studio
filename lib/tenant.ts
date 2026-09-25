import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Multi-tenant pilot. The customer's RelayDance API key is their identity and
// their wallet, so it is never written to disk on the server: the browser keeps
// it in sessionStorage (gone when the tab closes) and sends it only with the
// requests that spend money. The cookie carries a signed tenant id and nothing
// that could be charged. Demo mode (ARIA_MODE unset) keeps a single "default"
// tenant that uses the server's own key from the environment.

export const PILOT = process.env.ARIA_MODE === 'pilot'
export const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), 'data')
const COOKIE = 'aria_tenant'
const COOKIE_TTL_S = 60 * 60 * 12

export type Tenant = {
  id: string
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
    dataDir: path.join(process.cwd(), 'data'),
    mediaDir: path.join(process.cwd(), 'public', 'media'),
    mediaUrlBase: '/m',
  }
}

export function tenantById(id: string): Tenant {
  if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('bad tenant id')
  const dataDir = path.join(DATA_ROOT, 'tenants', id)
  const mediaDir = path.join(dataDir, 'media')
  fs.mkdirSync(mediaDir, { recursive: true })
  return { id, dataDir, mediaDir, mediaUrlBase: '/m' }
}

// ---------- signed tenant cookie (no secrets inside) ----------

const SECRET =
  process.env.ARIA_COOKIE_SECRET ||
  (() => {
    if (PILOT) console.warn('[tenant] ARIA_COOKIE_SECRET is unset: sessions will not survive a restart')
    return crypto.randomBytes(32).toString('hex')
  })()

function sign(payload: string) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
}

export function tenantCookie(id: string, clear = false) {
  const exp = Math.floor(Date.now() / 1000) + COOKIE_TTL_S
  const payload = `${id}.${exp}`
  const value = clear ? '' : `${payload}.${sign(payload)}`
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  const base = `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}`
  return clear ? `${base}; Max-Age=0` : `${base}; Max-Age=${COOKIE_TTL_S}`
}

function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

export function tenantIdFromCookie(req: Request): string | null {
  const v = cookieValue(req, COOKIE)
  if (!v) return null
  const [id, exp, sig] = v.split('.')
  if (!id || !exp || !sig) return null
  const expect = sign(`${id}.${exp}`)
  if (sig.length !== expect.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
  if (Number(exp) < Date.now() / 1000) return null
  return id
}

/** Resolve the tenant for a request. Demo mode always returns the default tenant. */
export function tenantFromRequest(req: Request): Tenant | null {
  if (!PILOT) return defaultTenant()
  const id = tenantIdFromCookie(req)
  if (!id) return null
  try {
    return tenantById(id)
  } catch {
    return null
  }
}

/** The customer's key travels only in the Authorization header of spending requests. */
export function keyFromRequest(req: Request): string | null {
  const h = (req.headers.get('authorization') || '').trim()
  const m = /^Bearer\s+(sk-[A-Za-z0-9]{20,})$/.exec(h)
  return m ? m[1] : null
}

/** Validate a RelayDance key by listing models with it (free call). */
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

/** remainingUsd is null for a key with unlimited quota (it draws on the account balance instead). */
export type Balance = { remainingUsd: number | null; quotaUsd: number | null; usedUsd: number }

/**
 * Remaining balance for a key, from the OpenAI-style billing endpoints RelayDance
 * exposes: subscription.hard_limit_usd is the key's total quota (remaining plus
 * used), usage.total_usage is what the key has spent in cents. A key with unlimited
 * quota reports a sentinel of 100 million.
 */
export async function relaydanceBalance(key: string): Promise<Balance | null> {
  const headers = { Authorization: `Bearer ${key}` }
  try {
    const [s, u] = await Promise.all([
      fetch('https://relaydance.com/v1/dashboard/billing/subscription', { headers, signal: AbortSignal.timeout(15000) }),
      fetch('https://relaydance.com/v1/dashboard/billing/usage', { headers, signal: AbortSignal.timeout(15000) }),
    ])
    if (!s.ok) return null
    const sj = await s.json()
    const uj = u.ok ? await u.json().catch(() => ({})) : {}
    const quota = Number(sj.hard_limit_usd ?? 0)
    const used = Number(uj.total_usage ?? 0) / 100
    if (quota >= 1e8) return { remainingUsd: null, quotaUsd: null, usedUsd: used }
    return { remainingUsd: Math.round((quota - used) * 100) / 100, quotaUsd: quota, usedUsd: used }
  } catch {
    return null
  }
}
