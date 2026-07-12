import fs from 'node:fs'
import path from 'node:path'

// RelayDance (Seedance 2.0) text-to-video client.
// Submit -> poll -> download. Files land in public/media so Next serves them.

const RD_BASE = 'https://relaydance.com'
export const VIDEO_MODEL_FAST = 'doubao-seedance-2-0-fast-260128'
export const VIDEO_MODEL_MINI = 'doubao-seedance-2-0-mini-720p'
export const VIDEO_MODEL_HQ = 'doubao-seedance-2-0-720p'

function key() {
  const k = process.env.RELAYDANCE_API_KEY
  if (!k) throw new Error('RELAYDANCE_API_KEY missing')
  return k
}

export async function submitVideo(
  prompt: string,
  opts?: { duration?: number; ratio?: string; model?: string },
): Promise<string> {
  const res = await fetch(`${RD_BASE}/v1/video/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
    body: JSON.stringify({
      model: opts?.model ?? VIDEO_MODEL_FAST,
      prompt,
      ratio: opts?.ratio ?? '9:16',
      duration: opts?.duration ?? 5,
    }),
  })
  if (!res.ok) throw new Error(`relaydance submit ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  if (!json.task_id) throw new Error('relaydance submit: no task_id')
  return json.task_id
}

export async function pollVideoOnce(
  taskId: string,
): Promise<{ status: string; progress: number; url?: string }> {
  const res = await fetch(`${RD_BASE}/v1/videos/${taskId}`, {
    headers: { Authorization: `Bearer ${key()}` },
  })
  if (!res.ok) throw new Error(`relaydance poll ${res.status}`)
  const json = await res.json()
  const status = String(json.status || '').toLowerCase()
  const url = json?.metadata?.url || json?.result_url
  return { status, progress: Number(json.progress || 0), url }
}

export async function generateVideo(
  prompt: string,
  destAbsPath: string,
  onProgress?: (pct: number, phase: string) => void,
  opts?: { duration?: number; ratio?: string; model?: string; maxWaitS?: number },
): Promise<void> {
  // "no dialogue" suffix dodges the upstream audio content filter's false positives
  const safePrompt = `${prompt} No dialogue, no voiceover, ambient sound only.`
  try {
    await generateVideoOnce(safePrompt, destAbsPath, onProgress, opts)
  } catch (e) {
    console.error('[video] attempt 1 failed, retrying once:', (e as Error).message)
    onProgress?.(2, 'retrying')
    await generateVideoOnce(safePrompt, destAbsPath, onProgress, opts)
  }
}

async function generateVideoOnce(
  prompt: string,
  destAbsPath: string,
  onProgress?: (pct: number, phase: string) => void,
  opts?: { duration?: number; ratio?: string; model?: string; maxWaitS?: number },
): Promise<void> {
  const taskId = await submitVideo(prompt, opts)
  onProgress?.(2, 'queued')
  const maxWait = (opts?.maxWaitS ?? 420) * 1000
  const start = Date.now()
  let url: string | undefined
  let lastPct = -1
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 5000))
    try {
      const st = await pollVideoOnce(taskId)
      if (st.progress !== lastPct && st.progress > 0) {
        lastPct = st.progress
        onProgress?.(Math.min(st.progress, 99), 'rendering')
      }
      if (['completed', 'succeeded', 'success'].includes(st.status)) {
        url = st.url
        break
      }
      if (['failed', 'failure', 'error'].includes(st.status)) {
        throw new Error('render task failed upstream')
      }
    } catch (e) {
      if ((e as Error).message.includes('upstream')) throw e
      // transient poll error: keep waiting
    }
  }
  if (!url) throw new Error('render timeout')
  onProgress?.(99, 'downloading')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`video download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(destAbsPath), { recursive: true })
  fs.writeFileSync(destAbsPath, buf)
  onProgress?.(100, 'done')
}
