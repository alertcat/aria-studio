import { storeForRequest, unauthorized, spendKey } from '@/lib/ctx'
import { relaydanceBalance } from '@/lib/tenant'
import { PILOT_ESTIMATE } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GATE 2: approve costs nothing more; a revision renders again, so it is a
// spending action and needs the customer's key plus a balance check in pilot.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { orderId, action, feedback } = body
  if (!orderId || !action) return Response.json({ error: 'orderId and action required' }, { status: 400 })
  if (action === 'approve') {
    st.approveOrder(String(orderId))
  } else if (action === 'revise') {
    const { key, error } = spendKey(req, st)
    if (error) return error
    if (key) {
      const need = PILOT_ESTIMATE.renderUsd + PILOT_ESTIMATE.posterUsd
      const b = await relaydanceBalance(key)
      if (b && b.remainingUsd < need) {
        return Response.json({ error: 'insufficient balance', remainingUsd: b.remainingUsd, needUsd: need }, { status: 402 })
      }
    }
    void st.runRevision(String(orderId), String(feedback || 'Tighten the concept and make the product the hero.'), key)
  } else {
    return Response.json({ error: 'unknown action' }, { status: 400 })
  }
  return Response.json({ ok: true })
}
