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

const RELAYROUTER = 'https://relayrouter.io/v1/chat/completions'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type ChatOpts = { system: string; user: string; maxTokens?: number; model?: string }

/** One OpenAI-compatible call against relayrouter.io with the given key. */
async function relayrouterOnce(
  opts: ChatOpts & { model: string; apiKey: string | undefined; tokenField: 'max_tokens' | 'max_completion_tokens'; reasoning?: boolean; timeoutMs?: number },
): Promise<string> {
  const { system, user, maxTokens = 2000, model, apiKey, tokenField, reasoning, timeoutMs = 90_000 } = opts
  if (!apiKey) throw new Error(`no key for ${model}`)
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    [tokenField]: maxTokens,
  }
  if (reasoning) body.reasoning_effort = 'low'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    let res = await fetch(RELAYROUTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const errText = await res.text()
      if (reasoning && /reasoning_effort/i.test(errText)) {
        delete body.reasoning_effort
        res = await fetch(RELAYROUTER, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
        if (!res.ok) throw new Error(`relayrouter ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`)
      } else {
        throw new Error(`relayrouter ${model} ${res.status}: ${errText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`)
      }
    }
    const json = await res.json()
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error(`relayrouter ${model}: empty completion`)
    return String(content).trim()
  } finally {
    clearTimeout(timer)
  }
}

// ---------- directors: Claude on the founder's relay ----------
// Order of preference is the founder's: claude-opus-5-5 for quality (about 12 s
// per concept), claude-sonnet-5 next, claude-haiku-4-5 as the safety net. Each
// step is tried once; a gateway error or timeout moves on. The GPT pool on the
// relay is kept out: its accounts were failing or answering in over a minute.
const DIRECTOR_CHAIN = [
  { model: 'claude-opus-5-5', keyEnv: 'RELAYROUTER_API_KEY', tokenField: 'max_tokens' as const, reasoning: false, timeoutMs: 90_000 },
  { model: 'claude-sonnet-5', keyEnv: 'RELAYROUTER_API_KEY', tokenField: 'max_tokens' as const, reasoning: false, timeoutMs: 90_000 },
  { model: 'claude-haiku-4-5-20251001', keyEnv: 'RELAYROUTER_API_KEY', tokenField: 'max_tokens' as const, reasoning: false, timeoutMs: 90_000 },
]

// A model that just failed is skipped for a while so an outage does not add a
// timeout to every order; it is retried automatically once the window passes.
const DOWN_FOR_MS = 10 * 60 * 1000
const downSince: Record<string, number> = {}

export async function chatDirector(opts: ChatOpts): Promise<string> {
  const errors: string[] = []
  for (const step of DIRECTOR_CHAIN) {
    const apiKey = process.env[step.keyEnv]
    if (!apiKey) continue
    if (Date.now() - (downSince[step.model] ?? 0) < DOWN_FOR_MS) continue
    try {
      const t0 = Date.now()
      const out = await relayrouterOnce({ ...opts, model: step.model, apiKey, tokenField: step.tokenField, reasoning: step.reasoning, timeoutMs: step.timeoutMs })
      delete downSince[step.model]
      console.log(`[llm] director ok: ${step.model} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
      return out
    } catch (e) {
      downSince[step.model] = Date.now()
      errors.push((e as Error).message.slice(0, 120))
      console.error(`[llm] director ${step.model} failed, trying next:`, (e as Error).message.slice(0, 160))
    }
  }
  throw new Error('all director models failed: ' + errors.join(' | '))
}

/** Kept for older call sites: directors no longer touch api.openai.com. */
export const chatOpenAI = chatDirector

// ---------- Claude (jury): primary = user's own RelayRouter relay, fallback = OpenRouter ----------
export async function chatClaude(opts: { system: string; user: string; maxTokens?: number }): Promise<string> {
  try {
    return await chatRelayRouter({ ...opts, model: 'claude-sonnet-5' })
  } catch (e) {
    console.error('[llm] relayrouter jury failed, falling back to openrouter:', (e as Error).message)
    await sleep(1200)
    return await chatClaudeOnce({ ...opts, model: 'anthropic/claude-sonnet-5' })
  }
}

// OpenAI-compatible chat against relayrouter.io (hosts claude-* models)
export async function chatRelayRouter(opts: ChatOpts): Promise<string> {
  const { maxTokens = 500, model = 'claude-sonnet-5' } = opts
  return relayrouterOnce({ ...opts, maxTokens, model, apiKey: process.env.RELAYROUTER_API_KEY, tokenField: 'max_tokens' })
}

async function chatClaudeOnce(opts: ChatOpts): Promise<string> {
  const { system, user, maxTokens = 400, model = 'anthropic/claude-sonnet-5' } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 90_000)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://aria.relaydance.com',
        'X-Title': 'Aria Studio',
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
