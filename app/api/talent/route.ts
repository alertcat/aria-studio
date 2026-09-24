import { TALENTS, warmTalents } from '@/lib/talent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ talents: TALENTS })
}

// Pre-register every portrait in the private asset library (run before a demo).
export async function POST() {
  const result = await warmTalents()
  return Response.json({ ok: true, assets: result })
}
