import fs from 'node:fs'
import path from 'node:path'

// ---------- disk cache: every successful LLM output is cached so the live
// ---------- demo can survive a dead network / dead key by replaying.
const DATA_DIR = path.join(process.cwd(), 'data')
const CACHE_PATH = path.join(DATA_DIR, 'llm-cache.json')

let cache: Record<string, string> | null = null

function loadCache(): Record<string, string> {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
  } catch {
    cache = {}
  }
  return cache!
}

function saveCache() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(loadCache(), null, 1))
  } catch {
    /* non-fatal */
  }
}

export function cacheKey(...parts: (string | number)[]) {
  return parts.join('|').replace(/\s+/g, ' ').slice(0, 300)
}

// ---------- OpenAI (worker agents) ----------
export async function chatOpenAI(opts: {
  system: string
  user: string
  maxTokens?: number
  model?: string
}): Promise<string> {
  const { system, user, maxTokens = 3800, model = 'gpt-5.4-mini' } = opts
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: maxTokens,
    reasoning_effort: 'low',
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 110_000)
  try {
    let res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const errText = await res.text()
      // graceful param downgrade for older/other models
      if (/reasoning_effort/i.test(errText)) {
        delete body.reasoning_effort
        res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`)
      } else {
        throw new Error(`openai ${res.status}: ${errText.slice(0, 300)}`)
      }
    }
    const json = await res.json()
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error('openai: empty completion')
    return content.trim()
  } finally {
    clearTimeout(timer)
  }
}

// ---------- Claude (jury): primary = user's own RelayRouter relay, fallback = OpenRouter ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function chatClaude(opts: {
  system: string
  user: string
  maxTokens?: number
}): Promise<string> {
  try {
    return await chatRelayRouter({ ...opts, model: 'claude-sonnet-5' })
  } catch (e) {
    console.error('[llm] relayrouter jury failed, falling back to openrouter:', (e as Error).message)
    await sleep(1200)
    return await chatClaudeOnce({ ...opts, model: 'anthropic/claude-sonnet-5' })
  }
}

// OpenAI-compatible chat against relayrouter.io (hosts claude-* models)
export async function chatRelayRouter(opts: {
  system: string
  user: string
  maxTokens?: number
  model?: string
}): Promise<string> {
  const { system, user, maxTokens = 500, model = 'claude-sonnet-5' } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90_000)
  try {
    const res = await fetch('https://relayrouter.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RELAYROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`relayrouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = await res.json()
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error('relayrouter: empty completion')
    return content.trim()
  } finally {
    clearTimeout(timer)
  }
}

async function chatClaudeOnce(opts: {
  system: string
  user: string
  maxTokens?: number
  model?: string
}): Promise<string> {
  const { system, user, maxTokens = 400, model = 'anthropic/claude-sonnet-5' } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90_000)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://solocorp.dev',
        'X-Title': 'SoloCorp OS',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = await res.json()
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error('openrouter: empty completion')
    return content.trim()
  } finally {
    clearTimeout(timer)
  }
}

// ---------- reliability wrapper: live call -> cache -> canned fallback ----------
export async function reliable(
  key: string,
  live: () => Promise<string>,
  fallback: () => string,
): Promise<{ content: string; cached: boolean }> {
  try {
    const v = await live()
    loadCache()[key] = v
    saveCache()
    return { content: v, cached: false }
  } catch (e) {
    console.error(`[llm] live call failed for ${key}:`, (e as Error).message)
    const hit = loadCache()[key]
    if (hit) return { content: hit, cached: true }
    return { content: fallback(), cached: true }
  }
}
