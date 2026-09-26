import { storeForRequest, unauthorized, spendKey } from '@/lib/ctx'
import { relaydanceBalance, PILOT } from '@/lib/tenant'
import { LIMITS, globalActiveCount } from '@/lib/store'
import { normalizeSpec, preChargeUsd } from '@/lib/models'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GATE 1: the customer funds the render. In pilot mode the request carries their
// key, the balance is checked against the estimate for the chosen spec first, and
// the key is handed to the render job in memory only.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (!body.orderId) return Response.json({ error: 'orderId required' }, { status: 400 })
  const orderId = String(body.orderId)
  const spec = normalizeSpec(body.spec)
  const { key, error } = spendKey(req, st)
  if (error) return error
  if (PILOT) {
    if (st.activeCount(orderId) >= LIMITS.concurrentPerTenant) {
      return Response.json({ error: 'busy', reason: 'One job at a time: wait for the current order to finish.' }, { status: 429 })
    }
    if (globalActiveCount(orderId) >= LIMITS.concurrentGlobal) {
      return Response.json({ error: 'studio busy', reason: 'The studio is busy right now, try again in a minute.' }, { status: 429 })
    }
  }
  if (key) {
    const need = preChargeUsd(spec)
    const b = await relaydanceBalance(key)
    if (b && b.remainingUsd !== null && b.remainingUsd < need) {
      return Response.json({ error: 'insufficient balance', remainingUsd: b.remainingUsd, needUsd: need }, { status: 402 })
    }
  }
  st.greenlightOrder(orderId, body.agentId ? String(body.agentId) : undefined, body.talentId ? String(body.talentId) : undefined, key, spec)
  return Response.json({ ok: true, spec })
}
