import { storeForRequest, unauthorized, spendKey } from '@/lib/ctx'
import { relaydanceBalance } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Remaining RelayDance balance for the key in the Authorization header.
export async function GET(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const { key, error } = spendKey(req, st)
  if (error) return error
  if (!key) return Response.json({ balance: null, demo: true })
  return Response.json({ balance: await relaydanceBalance(key) })
}
