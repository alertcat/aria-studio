import { approveOrder, runRevision } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { orderId, action, feedback } = body
  if (!orderId || !action) {
    return Response.json({ error: 'orderId and action required' }, { status: 400 })
  }
  if (action === 'approve') {
    approveOrder(orderId)
  } else if (action === 'revise') {
    void runRevision(orderId, String(feedback || 'Tighten the recommendation and quantify the risks.'))
  } else {
    return Response.json({ error: 'unknown action' }, { status: 400 })
  }
  return Response.json({ ok: true })
}
