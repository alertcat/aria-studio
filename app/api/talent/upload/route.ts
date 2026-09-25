import { storeForRequest, unauthorized, spendKey } from '@/lib/ctx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_BYTES = 8 * 1024 * 1024

// Upload a synthetic portrait and register it in the customer's private asset
// library, so it can be picked as a virtual talent. Uses the key from the
// request only. Real people are rejected upstream; the UI says so.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const { key, error } = spendKey(req, st)
  if (error) return error
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'file required' }, { status: 400 })
  const ext = EXT[file.type]
  if (!ext) return Response.json({ error: 'png, jpg or webp only' }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'image larger than 8 MB' }, { status: 413 })
  const name = String(form?.get('name') || '').trim().slice(0, 40) || 'Custom'
  const blob = Buffer.from(await file.arrayBuffer())
  try {
    const talent = await st.addTalent({ blob, ext, name, apiKey: key })
    return Response.json({ ok: true, talent })
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 })
  }
}
