import { getStore, ev } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin hygiene: drop delivered orders that have no media (failed renders
// accepted during outages), then recompute the books from what remains.
export async function POST() {
  const S = getStore()
  const before = S.state.orders.length
  S.state.orders = S.state.orders.filter(
    (o) => !(o.status === 'delivered' && !o.videoFile && !o.posterFile),
  )
  const removed = before - S.state.orders.length
  const delivered = S.state.orders.filter((o) => o.status === 'delivered')
  S.state.revenue = delivered.reduce((s, o) => s + o.amountUsd, 0)
  S.state.delivered = delivered.length
  if (removed > 0) ev('BOOK', `Books reconciled: ${removed} mediless order(s) written off`)
  return Response.json({ ok: true, removed, revenue: S.state.revenue, delivered: S.state.delivered })
}
