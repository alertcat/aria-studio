import { storeForRequest, unauthorized } from '@/lib/ctx'
import { TEMPLATES, LIMITS, globalActiveCount } from '@/lib/store'
import { PILOT } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Concepts and jury run on the studio's own LLM keys, so a pilot key gets a
// budget: one job at a time, a daily cap, an overall cap, and a studio-wide
// concurrency ceiling. Renders are on the customer's key and gated elsewhere.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  if (PILOT) {
    if (st.activeCount() >= LIMITS.concurrentPerTenant) {
      return Response.json({ error: 'busy', reason: 'One job at a time: wait for the current order to finish.' }, { status: 429 })
    }
    if (st.createdLast24h() >= LIMITS.perDay) {
      return Response.json({ error: 'daily limit', reason: 'Daily limit reached for this key. Try again tomorrow.' }, { status: 429 })
    }
    if (st.getStore().state.orders.length >= LIMITS.totalPerTenant) {
      return Response.json({ error: 'order limit', reason: 'Order limit reached for this pilot key.' }, { status: 429 })
    }
    if (globalActiveCount() >= LIMITS.concurrentGlobal) {
      return Response.json({ error: 'studio busy', reason: 'The studio is busy right now, try again in a minute.' }, { status: 429 })
    }
  }
  const body = await req.json().catch(() => ({}))
  const tpl = typeof body.template === 'number' ? TEMPLATES[body.template] : null
  const input = tpl ?? {
    client: body.client,
    title: body.title,
    brief: body.brief,
    amountUsd: Number(body.amountUsd),
    vertical: body.vertical,
  }
  if (!input?.title || !input?.brief) {
    return Response.json({ error: 'title and brief required' }, { status: 400 })
  }
  const order = st.createOrder(input)
  void st.runPipeline(order.id)
  return Response.json({ ok: true, id: order.id })
}
