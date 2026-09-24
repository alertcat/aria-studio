import { storeForRequest, unauthorized } from '@/lib/ctx'
import { TALENTS } from '@/lib/talent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ talents: TALENTS })
}

// Pre-register every portrait in this tenant's private asset library.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const result = await st.warm()
  return Response.json({ ok: true, assets: result })
}
