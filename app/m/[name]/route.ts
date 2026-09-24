import fs from 'node:fs'
import path from 'node:path'
import { tenantFromRequest } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
}

// Serves media rendered at runtime from the tenant's media directory.
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const tenant = tenantFromRequest(req)
  if (!tenant) return new Response('login required', { status: 401 })
  const { name } = await ctx.params
  const safe = path.basename(name)
  const ext = path.extname(safe).toLowerCase()
  const abs = path.join(tenant.mediaDir, safe)
  if (!MIME[ext] || !fs.existsSync(abs)) return new Response('not found', { status: 404 })
  const stat = fs.statSync(abs)
  const stream = fs.createReadStream(abs)
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': MIME[ext],
      'Content-Length': String(stat.size),
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  })
}
