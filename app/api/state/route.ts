import { storeForRequest, unauthorized } from '@/lib/ctx'
import { anonymousState } from '@/lib/store'
import { PILOT } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Pilot visitors without a key get the workbench shell (no tenant data) so the
// key field lives inside the studio instead of a separate gate.
export async function GET(req: Request) {
  const st = storeForRequest(req)
  if (!st) return PILOT ? Response.json(anonymousState()) : unauthorized()
  return Response.json(st.publicState())
}
