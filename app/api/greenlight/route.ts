import { greenlightOrder } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (!body.orderId) {
    return Response.json({ error: 'orderId required' }, { status: 400 })
  }
  greenlightOrder(String(body.orderId), body.agentId ? String(body.agentId) : undefined)
  return Response.json({ ok: true })
}
