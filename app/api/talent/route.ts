import { storeForRequest, unauthorized, spendKey } from '@/lib/ctx'
import { TALENTS } from '@/lib/talent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ talents: TALENTS })
}

// Pre-register every portrait in this tenant's private asset library. Uses the
// customer's key from the request, never a stored one.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const { key, error } = spendKey(req, st)
  if (error) return error
  const result = await st.warm(key)
  return Response.json({ ok: true, assets: result })
}
