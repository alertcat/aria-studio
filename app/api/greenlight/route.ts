import { storeForRequest, unauthorized, spendKey } from '@/lib/ctx'
import { relaydanceBalance } from '@/lib/tenant'
import { PILOT_ESTIMATE } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GATE 1: the customer funds the render. In pilot mode the request carries their
// key, the balance is checked against the estimate first, and the key is handed
// to the render job in memory only.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (!body.orderId) return Response.json({ error: 'orderId required' }, { status: 400 })
  const { key, error } = spendKey(req, st)
  if (error) return error
  if (key) {
    const need = PILOT_ESTIMATE.renderUsd + PILOT_ESTIMATE.posterUsd
    const b = await relaydanceBalance(key)
    if (b && b.remainingUsd < need) {
      return Response.json({ error: 'insufficient balance', remainingUsd: b.remainingUsd, needUsd: need }, { status: 402 })
    }
  }
  st.greenlightOrder(
    String(body.orderId),
    body.agentId ? String(body.agentId) : undefined,
    body.talentId ? String(body.talentId) : undefined,
    key,
  )
  return Response.json({ ok: true })
}
