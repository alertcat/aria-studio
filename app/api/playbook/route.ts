import { getStore, ev } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  if (typeof body.playbook !== 'string' || body.playbook.length < 10) {
    return Response.json({ error: 'playbook too short' }, { status: 400 })
  }
  getStore().state.playbook = body.playbook.slice(0, 4000)
  ev('BOOK', 'CEO updated the Playbook, the human experience layer just changed')
  return Response.json({ ok: true })
}
