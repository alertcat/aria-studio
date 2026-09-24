import { storeForRequest, unauthorized } from '@/lib/ctx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  st.resetCompany()
  return Response.json({ ok: true })
}
