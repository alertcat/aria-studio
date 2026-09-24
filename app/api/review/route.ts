import { storeForRequest, unauthorized } from '@/lib/ctx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { orderId, action, feedback } = body
  if (!orderId || !action) return Response.json({ error: 'orderId and action required' }, { status: 400 })
  if (action === 'approve') {
    st.approveOrder(String(orderId))
  } else if (action === 'revise') {
    void st.runRevision(String(orderId), String(feedback || 'Tighten the concept and make the product the hero.'))
  } else {
    return Response.json({ error: 'unknown action' }, { status: 400 })
  }
  return Response.json({ ok: true })
}
