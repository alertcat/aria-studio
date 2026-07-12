import { createOrder, runPipeline, TEMPLATES } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const tpl = typeof body.template === 'number' ? TEMPLATES[body.template] : null
  const input = tpl ?? {
    client: body.client,
    title: body.title,
    brief: body.brief,
    amountUsd: Number(body.amountUsd),
  }
  if (!input?.title || !input?.brief) {
    return Response.json({ error: 'title and brief required' }, { status: 400 })
  }
  const order = createOrder(input)
  // fire-and-forget: the pipeline streams progress into the event feed
  void runPipeline(order.id)
  return Response.json({ ok: true, id: order.id })
}
