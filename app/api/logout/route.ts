import { sessionCookie } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('', true) },
  })
}
