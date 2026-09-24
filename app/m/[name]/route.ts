import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media')
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
}

// Serves media rendered at runtime. next start only serves public/ files
// that existed at build time, so fresh renders need a real route.
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  const safe = path.basename(name)
  const ext = path.extname(safe).toLowerCase()
  const abs = path.join(MEDIA_DIR, safe)
  if (!MIME[ext] || !fs.existsSync(abs)) {
    return new Response('not found', { status: 404 })
  }
  const stat = fs.statSync(abs)
  const stream = fs.createReadStream(abs)
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': MIME[ext],
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  })
}
