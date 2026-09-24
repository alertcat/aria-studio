import { storeForRequest, unauthorized } from '@/lib/ctx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (!body.orderId) return Response.json({ error: 'orderId required' }, { status: 400 })
  st.greenlightOrder(
    String(body.orderId),
    body.agentId ? String(body.agentId) : undefined,
    body.talentId ? String(body.talentId) : undefined,
  )
  return Response.json({ ok: true })
}
