import fs from 'node:fs'
import path from 'node:path'

// RelayDance gpt-image-2 client. Returns b64, we persist to public/media.

export async function generateImage(
  prompt: string,
  destAbsPath: string,
  opts?: { size?: string },
): Promise<void> {
  const k = process.env.RELAYDANCE_API_KEY
  if (!k) throw new Error('RELAYDANCE_API_KEY missing')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 180_000)
  try {
    const res = await fetch('https://relaydance.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt,
        size: opts?.size ?? '1024x1536',
        n: 1,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`image ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    const item = json.data?.[0]
    if (!item) throw new Error('image: empty data')
    let buf: Buffer
    if (item.b64_json) {
      buf = Buffer.from(item.b64_json, 'base64')
    } else if (item.url) {
      const dl = await fetch(item.url)
      if (!dl.ok) throw new Error(`image download ${dl.status}`)
      buf = Buffer.from(await dl.arrayBuffer())
    } else {
      throw new Error('image: no b64 or url')
    }
    fs.mkdirSync(path.dirname(destAbsPath), { recursive: true })
    fs.writeFileSync(destAbsPath, buf)
  } finally {
    clearTimeout(timer)
  }
}
