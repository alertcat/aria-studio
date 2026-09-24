import { storeForRequest, unauthorized } from '@/lib/ctx'
import type { Order } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin hygiene: drop delivered orders that have no media, then recompute the books.
export async function POST(req: Request) {
  const st = storeForRequest(req)
  if (!st) return unauthorized()
  const S = st.getStore()
  const before = S.state.orders.length
  S.state.orders = S.state.orders.filter(
    (o: Order) => !(o.status === 'delivered' && !o.videoFile && !o.posterFile),
  )
  const removed = before - S.state.orders.length
  const delivered = S.state.orders.filter((o: Order) => o.status === 'delivered')
  S.state.revenue = delivered.reduce((s: number, o: Order) => s + o.amountUsd, 0)
  S.state.delivered = delivered.length
  if (removed > 0) st.ev('BOOK', `Books reconciled: ${removed} mediless order(s) written off`)
  return Response.json({ ok: true, removed, revenue: S.state.revenue, delivered: S.state.delivered })
}
