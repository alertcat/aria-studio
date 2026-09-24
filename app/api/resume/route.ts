import { storeForRequest, unauthorized, spendKey } from '@/lib/ctx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A render that was interrupted (server restart, timeout) still finishes
// upstream and is already paid for. This fetches that result instead of
// rendering again.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (!body.orderId) return Response.json({ error: 'orderId required' }, { status: 400 })
  const { key, error } = spendKey(req, st)
  if (error) return error
  const result = await st.resumeRender(String(body.orderId), key)
  return Response.json(result)
}
