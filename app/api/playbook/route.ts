import { storeForRequest, unauthorized } from '@/lib/ctx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const body = await req.json().catch(() => ({}))
  if (typeof body.playbook !== 'string' || body.playbook.length < 10) {
    return Response.json({ error: 'playbook too short' }, { status: 400 })
  }
  st.getStore().state.playbook = body.playbook.slice(0, 4000)
  st.ev('BOOK', 'CEO updated the Playbook, the human experience layer just changed')
  return Response.json({ ok: true })
}
