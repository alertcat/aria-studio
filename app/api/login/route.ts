import { createSession, sessionCookie, validateRelaydanceKey, PILOT, tenantIdFor } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Pilot login: the customer's RelayDance API key is the account. Renders bill to their balance.
export async function POST(req: Request) {
  if (!PILOT) return Response.json({ ok: true, demo: true })
  const body = await req.json().catch(() => ({}))
  const key = String(body.key || '').trim()
  if (!(await validateRelaydanceKey(key))) {
    return Response.json({ error: 'invalid key' }, { status: 401 })
  }
  const sid = createSession(key)
  return new Response(JSON.stringify({ ok: true, tenant: tenantIdFor(key) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(sid) },
  })
}
