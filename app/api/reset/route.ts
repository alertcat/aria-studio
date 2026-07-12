import { resetCompany } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  resetCompany()
  return Response.json({ ok: true })
}
