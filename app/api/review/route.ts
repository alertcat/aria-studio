import { storeForRequest, unauthorized, spendKey } from '@/lib/ctx'
import { relaydanceBalance, PILOT } from '@/lib/tenant'
import { LIMITS, globalActiveCount } from '@/lib/store'
import { DEFAULT_SPEC, preChargeUsd } from '@/lib/models'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GATE 2: approve costs nothing more; a revision renders again with the order's
// own spec, so it is a spending action and needs the customer's key plus a
// balance check in pilot, and it counts as a running job.
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
    if (PILOT) {
      if (st.activeCount(String(orderId)) >= LIMITS.concurrentPerTenant) {
        return Response.json({ error: 'busy', reason: 'One job at a time: wait for the current order to finish.' }, { status: 429 })
      }
      if (globalActiveCount(String(orderId)) >= LIMITS.concurrentGlobal) {
        return Response.json({ error: 'studio busy', reason: 'The studio is busy right now, try again in a minute.' }, { status: 429 })
      }
    }
    if (key) {
      const o = st.getStore().state.orders.find((x) => x.id === String(orderId))
      const need = preChargeUsd(o?.spec ?? DEFAULT_SPEC)
      const b = await relaydanceBalance(key)
      if (b && b.remainingUsd !== null && b.remainingUsd < need) {
        return Response.json({ error: 'insufficient balance', remainingUsd: b.remainingUsd, needUsd: need }, { status: 402 })
      }
    }
    const lang = body.lang === 'zh' || body.lang === 'en' ? body.lang : undefined
    void st.runRevision(String(orderId), String(feedback || 'Tighten the concept and make the product the hero.'), key, lang)
  } else {
    return Response.json({ error: 'unknown action' }, { status: 400 })
  }
  return Response.json({ ok: true })
}
