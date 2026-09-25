import fs from 'node:fs'
import path from 'node:path'

// RelayDance video client (Seedance family and MiniMax through the same task API).
// Submit -> poll -> download. Files land in the tenant's media dir.

const RD_BASE = 'https://relaydance.com'
export const VIDEO_MODEL_FAST = 'doubao-seedance-2-0-fast-260128'
export const VIDEO_MODEL_MINI = 'doubao-seedance-2-0-mini-720p'
export const VIDEO_MODEL_HQ = 'doubao-seedance-2-0-720p'

function key(override?: string) {
  const k = override || process.env.RELAYDANCE_API_KEY
  if (!k) throw new Error('RELAYDANCE_API_KEY missing')
  return k
}

export type VideoOpts = {
  duration?: number
  ratio?: string
  /** 480p / 720p / 1080p / 4k for seedance SKUs; passed through to the upstream payload */
  resolution?: string
  /** the SKU submitted, for example doubao-seedance-2-0-mini-480p */
  model?: string
  /** minimax takes a different request shape and no asset:// references */
  family?: 'seedance' | 'minimax'
  maxWaitS?: number
  /** asset:// URIs from the private asset library, passed as reference images */
  referenceAssets?: string[]
  /** the customer's own RelayDance key, held in memory for this job only; falls back to the server key (demo mode) */
  apiKey?: string
  /** called as soon as upstream accepts the task, so an interrupted job can be resumed without paying twice */
  onTask?: (taskId: string) => void
}

export async function submitVideo(prompt: string, opts?: VideoOpts): Promise<string> {
  const duration = opts?.duration ?? 5
  const ratio = opts?.ratio ?? '9:16'
  let body: Record<string, unknown>
  if (opts?.family === 'minimax') {
    // MiniMax H3: integer seconds as a string, ratio inside metadata, no asset library refs
    body = { model: opts.model, prompt, seconds: String(Math.round(duration)), metadata: { ratio } }
  } else {
    // NewAPI doubao task adapter: metadata is passed through to the BytePlus payload
    const metadata: Record<string, unknown> = { ratio, duration }
    if (opts?.resolution) metadata.resolution = opts.resolution
    if (opts?.referenceAssets?.length) {
      metadata.content = opts.referenceAssets.map((uri) => ({
        type: 'image_url',
        role: 'reference_image',
        image_url: { url: uri },
      }))
    }
    body = { model: opts?.model ?? VIDEO_MODEL_FAST, prompt, ratio, duration, metadata }
  }
  const res = await fetch(`${RD_BASE}/v1/video/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key(opts?.apiKey)}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`relaydance submit ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  if (!json.task_id) throw new Error('relaydance submit: no task_id')
  return json.task_id
}

export async function pollVideoOnce(
  taskId: string,
  apiKey?: string,
): Promise<{ status: string; progress: number; url?: string }> {
  const res = await fetch(`${RD_BASE}/v1/videos/${taskId}`, {
    headers: { Authorization: `Bearer ${key(apiKey)}` },
  })
  if (!res.ok) throw new Error(`relaydance poll ${res.status}`)
  const json = await res.json()
  const status = String(json.status || '').toLowerCase()
  const url = json?.metadata?.url || json?.result_url || json?.url
  return { status, progress: Number(json.progress || 0), url }
}

const DONE = ['completed', 'succeeded', 'success']
const FAILED = ['failed', 'failure', 'error']

async function downloadTo(url: string, destAbsPath: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`video download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(destAbsPath), { recursive: true })
  fs.writeFileSync(destAbsPath, buf)
}

/**
 * Check a task submitted earlier and, if it finished, download the clip. Nothing
 * new is submitted, so nothing new is charged.
 */
export async function fetchVideoResult(
  taskId: string,
  destAbsPath: string,
  apiKey?: string,
): Promise<{ status: 'completed' | 'failed' | 'running'; progress: number }> {
  const st = await pollVideoOnce(taskId, apiKey)
  if (DONE.includes(st.status)) {
    if (!st.url) throw new Error('task completed but no clip url')
    await downloadTo(st.url, destAbsPath)
    return { status: 'completed', progress: 100 }
  }
  if (FAILED.includes(st.status)) return { status: 'failed', progress: 0 }
  return { status: 'running', progress: st.progress }
}

export async function generateVideo(
  prompt: string,
  destAbsPath: string,
  onProgress?: (pct: number, phase: string) => void,
  opts?: VideoOpts,
): Promise<void> {
  // "no dialogue" suffix dodges the upstream audio content filter's false positives
  const safePrompt = `${prompt} No dialogue, no voiceover, ambient sound only.`
  try {
    await generateVideoOnce(safePrompt, destAbsPath, onProgress, opts)
  } catch (e) {
    // a timeout is not a failure: the task is still running upstream and is
    // already paid for, so the caller keeps the task id and fetches it later
    if ((e as Error).message.includes('timeout')) throw e
    console.error('[video] attempt 1 failed, retrying once:', (e as Error).message)
    onProgress?.(2, 'retrying')
    await generateVideoOnce(safePrompt, destAbsPath, onProgress, opts)
  }
}

async function generateVideoOnce(
  prompt: string,
  destAbsPath: string,
  onProgress?: (pct: number, phase: string) => void,
  opts?: VideoOpts,
): Promise<void> {
  const taskId = await submitVideo(prompt, opts)
  opts?.onTask?.(taskId)
  onProgress?.(2, 'queued')
  const maxWait = (opts?.maxWaitS ?? 420) * 1000
  const start = Date.now()
  let url: string | undefined
  let lastPct = -1
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 5000))
    try {
      const st = await pollVideoOnce(taskId, opts?.apiKey)
      if (st.progress !== lastPct && st.progress > 0) {
        lastPct = st.progress
        onProgress?.(Math.min(st.progress, 99), 'rendering')
      }
      if (DONE.includes(st.status)) {
        url = st.url
        break
      }
      if (FAILED.includes(st.status)) {
        throw new Error('render task failed upstream')
      }
    } catch (e) {
      if ((e as Error).message.includes('upstream')) throw e
      // transient poll error: keep waiting
    }
  }
  if (!url) throw new Error('render timeout')
  onProgress?.(99, 'downloading')
  await downloadTo(url, destAbsPath)
  onProgress?.(100, 'done')
}
