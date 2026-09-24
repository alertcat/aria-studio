import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Virtual talent library. Synthetic spokespersons (no real people) registered
// once into RelayDance's private asset library, referenced as asset:// in
// video requests so Seedance renders a consistent face without tripping the
// real-person input filter. Real-person talent uses the liveness track and is
// an enterprise option, not wired here.

export type Talent = {
  id: string
  name: string
  role: string
  fit: string[] // verticals this talent suits
  file: string // public path to portrait
}

export const TALENTS: Talent[] = [
  { id: 'mira', name: 'Mira', role: 'Consumer brand presenter', fit: ['product ad', 'brand film'], file: '/talent/mira.png' },
  { id: 'jonas', name: 'Jonas', role: 'Premium product presenter', fit: ['product ad', 'brand film'], file: '/talent/jonas.png' },
  { id: 'kai', name: 'Kai', role: 'Travel host', fit: ['travel promo'], file: '/talent/kai.png' },
  { id: 'amara', name: 'Amara', role: 'Travel host', fit: ['travel promo', 'brand film'], file: '/talent/amara.png' },
  { id: 'elena', name: 'Elena', role: 'Science presenter', fit: ['science explainer'], file: '/talent/elena.png' },
  { id: 'ravi', name: 'Ravi', role: 'Explainer host', fit: ['science explainer', 'product ad'], file: '/talent/ravi.png' },
]

const PAY = 'https://pay.relaydance.com'
const DATA_DIR = path.join(process.cwd(), 'data')
const CACHE_PATH = path.join(DATA_DIR, 'talent-assets.json')

function key() {
  const k = process.env.RELAYDANCE_API_KEY
  if (!k) throw new Error('RELAYDANCE_API_KEY missing')
  return k
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
  } catch {
    return {}
  }
}
function writeCache(c: Record<string, string>) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(c, null, 1))
}

async function j(method: string, url: string, body?: unknown, headers?: Record<string, string>, raw?: Buffer) {
  const res = await fetch(url, {
    method,
    headers: headers ?? { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 160)}`)
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

/** Returns the asset:// URI for a talent, registering the portrait on first use. */
export async function talentAssetUri(talentId: string): Promise<string> {
  const t = TALENTS.find((x) => x.id === talentId)
  if (!t) throw new Error(`unknown talent ${talentId}`)
  const cache = readCache()
  if (cache[t.id]) return cache[t.id]

  const abs = path.join(process.cwd(), 'public', t.file)
  const blob = fs.readFileSync(abs)
  const md5 = crypto.createHash('md5').update(blob).digest('hex')
  const ext = path.extname(abs).slice(1).toLowerCase()

  const u = await j('GET', `${PAY}/api/upload-url?ext=${ext}&md5=${md5}`)
  if (!u.exists) {
    await j('PUT', u.upload_url, undefined, { 'Content-Type': u.content_type }, blob)
  }
  const a = await j('POST', `${PAY}/api/assets/virtual/create`, {
    source_url: u.source_url,
    asset_type: 'Image',
    name: '',
  })
  let status = a.status
  for (let i = 0; i < 40 && status !== 'Active' && status !== 'Failed'; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const s = await j('GET', `${PAY}/api/assets/${a.id}/status`)
    status = s.status
  }
  if (status !== 'Active') throw new Error(`talent asset ${t.id} not active (${status})`)
  cache[t.id] = a.uri
  writeCache(cache)
  return a.uri
}

/** Pre-register every talent so the live demo never waits on ingest. */
export async function warmTalents(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const t of TALENTS) {
    try {
      out[t.id] = await talentAssetUri(t.id)
    } catch (e) {
      out[t.id] = 'ERR ' + (e as Error).message
    }
  }
  return out
}
