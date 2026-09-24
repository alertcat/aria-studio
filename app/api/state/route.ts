import { storeForRequest, unauthorized } from '@/lib/ctx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  return Response.json(st.publicState())
}
