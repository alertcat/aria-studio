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
  fit: string[] // verticals this talent suits (empty = fits everything)
  file: string // public path to portrait
  custom?: boolean // uploaded by the tenant, lives in their media dir
}

export type CustomTalent = Talent & { uri: string; custom: true }

export const TALENTS: Talent[] = [
  { id: 'mira', name: 'Mira', role: 'Consumer brand presenter', fit: ['product ad', 'brand film'], file: '/talent/mira.png' },
  { id: 'jonas', name: 'Jonas', role: 'Premium product presenter', fit: ['product ad', 'brand film'], file: '/talent/jonas.png' },
  { id: 'kai', name: 'Kai', role: 'Travel host', fit: ['travel promo'], file: '/talent/kai.png' },
  { id: 'amara', name: 'Amara', role: 'Travel host', fit: ['travel promo', 'brand film'], file: '/talent/amara.png' },
  { id: 'elena', name: 'Elena', role: 'Science presenter', fit: ['science explainer'], file: '/talent/elena.png' },
  { id: 'ravi', name: 'Ravi', role: 'Explainer host', fit: ['science explainer', 'product ad'], file: '/talent/ravi.png' },
]

const PAY = 'https://pay.relaydance.com'

export type TalentCtx = { apiKey?: string; dataDir?: string }

function key(override?: string) {
  const k = override || process.env.RELAYDANCE_API_KEY
  if (!k) throw new Error('RELAYDANCE_API_KEY missing')
  return k
}

function customPath(dataDir?: string) {
  return path.join(dataDir || path.join(process.cwd(), 'data'), 'custom-talents.json')
}
export function readCustomTalents(dataDir?: string): CustomTalent[] {
  try {
    const list = JSON.parse(fs.readFileSync(customPath(dataDir), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function writeCustomTalents(list: CustomTalent[], dataDir?: string) {
  const p = customPath(dataDir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(list, null, 1))
}
/** Built-in talents plus the tenant's own uploads. */
export function allTalents(dataDir?: string): Talent[] {
  return [...TALENTS, ...readCustomTalents(dataDir).map(({ uri: _uri, ...t }) => t)]
}

function cachePath(ctx?: TalentCtx) {
  return path.join(ctx?.dataDir || path.join(process.cwd(), 'data'), 'talent-assets.json')
}
function readCache(ctx?: TalentCtx): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(cachePath(ctx), 'utf-8'))
  } catch {
    return {}
  }
}
function writeCache(c: Record<string, string>, ctx?: TalentCtx) {
  const p = cachePath(ctx)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(c, null, 1))
}

async function j(method: string, url: string, body?: unknown, headers?: Record<string, string>, raw?: Buffer, apiKey?: string) {
  const res = await fetch(url, {
    method,
    headers: headers ?? { Authorization: `Bearer ${key(apiKey)}`, 'Content-Type': 'application/json' },
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

/** Upload a portrait to the private asset library and wait until it is Active. Returns the asset:// URI. */
export async function registerPortrait(blob: Buffer, ext: string, name: string, apiKey?: string): Promise<string> {
  const md5 = crypto.createHash('md5').update(blob).digest('hex')
  const u = await j('GET', `${PAY}/api/upload-url?ext=${ext}&md5=${md5}`, undefined, undefined, undefined, apiKey)
  if (!u.exists) {
    await j('PUT', u.upload_url, undefined, { 'Content-Type': u.content_type }, blob)
  }
  const a = await j('POST', `${PAY}/api/assets/virtual/create`, {
    source_url: u.source_url,
    asset_type: 'Image',
    name,
  }, undefined, undefined, apiKey)
  let status = a.status
  for (let i = 0; i < 40 && status !== 'Active' && status !== 'Failed'; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const s = await j('GET', `${PAY}/api/assets/${a.id}/status`, undefined, undefined, undefined, apiKey)
    status = s.status
  }
  if (status !== 'Active') throw new Error(`asset not active (${status}): the upstream audit rejects real people`)
  return a.uri
}

/** Returns the asset:// URI for a talent, registering a built-in portrait on first use. */
export async function talentAssetUri(talentId: string, ctx?: TalentCtx): Promise<string> {
  const custom = readCustomTalents(ctx?.dataDir).find((x) => x.id === talentId)
  if (custom) return custom.uri
  const t = TALENTS.find((x) => x.id === talentId)
  if (!t) throw new Error(`unknown talent ${talentId}`)
  const cache = readCache(ctx)
  if (cache[t.id]) return cache[t.id]

  const abs = path.join(process.cwd(), 'public', t.file)
  const blob = fs.readFileSync(abs)
  const ext = path.extname(abs).slice(1).toLowerCase()
  const uri = await registerPortrait(blob, ext, '', ctx?.apiKey)
  cache[t.id] = uri
  writeCache(cache, ctx)
  return uri
}

/** Save a tenant's own synthetic portrait, register it, and add it to their talent list. */
export async function addCustomTalent(input: {
  blob: Buffer
  ext: string
  name: string
  ctx: TalentCtx
  mediaDir: string
}): Promise<CustomTalent> {
  const id = 'c_' + crypto.randomBytes(4).toString('hex')
  const fileName = `talent_${id}.${input.ext}`
  fs.mkdirSync(input.mediaDir, { recursive: true })
  fs.writeFileSync(path.join(input.mediaDir, fileName), input.blob)
  const uri = await registerPortrait(input.blob, input.ext, input.name, input.ctx.apiKey)
  const t: CustomTalent = { id, name: input.name, role: 'Custom talent', fit: [], file: `/m/${fileName}`, uri, custom: true }
  const list = readCustomTalents(input.ctx.dataDir)
  list.push(t)
  writeCustomTalents(list, input.ctx.dataDir)
  return t
}

/** Pre-register every talent so the live demo never waits on ingest. */
export async function warmTalents(ctx?: TalentCtx): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const t of TALENTS) {
    try {
      out[t.id] = await talentAssetUri(t.id, ctx)
    } catch (e) {
      out[t.id] = 'ERR ' + (e as Error).message
    }
  }
  return out
}
