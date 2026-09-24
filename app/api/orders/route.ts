import { storeForRequest, unauthorized } from '@/lib/ctx'
import { TEMPLATES } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
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
