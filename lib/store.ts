import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { bradleyTerry, type Comparison } from './bt'
import { chatOpenAI, chatClaude, reliable, cacheKey } from './llm'
import { generateVideo, VIDEO_MODEL_FAST } from './video'

// ============================== types ==============================

export type AgentDef = {
  id: string
  tag: string
  name: string
  role: string
  style: string
  feeUsd: number
  reputation: number
  delivered: number
  status: 'idle' | 'working'
}

export type Concept = {
  concept: string
  hook: string
  beats: string[]
  style: string
  video_prompt: string
}

export type Draft = {
  agentId: string
  content: string
  concept: Concept
  cached: boolean
  revised?: boolean
}
export type Duel = { a: string; b: string; winner: string; judge: string; reason: string }
export type RankEntry = { agentId: string; score: number; wins: number }

export type OrderStatus =
  | 'inbox'
  | 'concepting'
  | 'jury'
  | 'producing'
  | 'review'
  | 'revising'
  | 'delivered'

export type Order = {
  id: string
  client: string
  title: string
  brief: string
  amountUsd: number
  status: OrderStatus
  createdAt: number
  revision: number
  drafts: Draft[]
  duels: Duel[]
  ranking: RankEntry[]
  winnerAgentId?: string
  videoFile?: string
  videoProgress?: number
  videoNote?: string
  feedback?: string
  invoice?: { id: string; paidAt: number; ref: string }
  error?: string
}

export type Ev = { t: number; tag: string; text: string; orderId?: string }

export type State = {
  orders: Order[]
  events: Ev[]
  revenue: number
  delivered: number
  playbook: string
}

// ============================== company config ==============================

export const COMPANY = {
  name: 'SoloCorp OS',
  ceo: 'alertcat',
  vertical: 'one-person ad studio: agents ship real video, human acceptance releases escrow',
}

const DEFAULT_PLAYBOOK = `1. First frame must hook in half a second. No slow fades, no logo intros.
2. One idea per ad. If the concept needs a sentence of explanation, kill it.
3. Native vertical 9:16, designed for sound-off viewing.
4. Never render on-screen text, UI, logos or celebrity likeness in generated footage.
5. End on the product hero shot. Brand recall beats cleverness.`

export const WORKERS: AgentDef[] = [
  {
    id: 'volt',
    tag: 'VT',
    name: 'VOLT',
    role: 'Hype Director',
    style:
      'kinetic high-energy social-native ads: whip pans, speed ramps, punchy cuts, bold saturated color, UGC adrenaline',
    feeUsd: 25,
    reputation: 10,
    delivered: 0,
    status: 'idle',
  },
  {
    id: 'sable',
    tag: 'SB',
    name: 'SABLE',
    role: 'Cinematic Director',
    style:
      'premium filmic ads: slow deliberate camera moves, dramatic rim light, macro textures, moody atmosphere, luxury restraint',
    feeUsd: 25,
    reputation: 10,
    delivered: 0,
    status: 'idle',
  },
  {
    id: 'pixel',
    tag: 'PX',
    name: 'PIXEL',
    role: 'Playful Director',
    style:
      'colorful quirky concepts: unexpected juxtapositions, toy-like miniature worlds, stop-motion energy, wit over polish',
    feeUsd: 25,
    reputation: 10,
    delivered: 0,
    status: 'idle',
  },
]

export const JUDGES = [
  {
    id: 'brand',
    name: 'Judge BRAND',
    criterion:
      'brand fit and message clarity: does this concept sell the actual product on brief, will the client recognise their brand promise, is it feasible as a single 5 second generated shot',
  },
  {
    id: 'scroll',
    name: 'Judge SCROLL',
    criterion:
      'scroll-stopping power: how hard does the first half-second hook, visual novelty, thumb-stopping energy on a muted vertical feed',
  },
]

export const TEMPLATES = [
  {
    client: 'Kopi Loco',
    title: '5s vertical bumper: cold brew can launch',
    brief:
      'Singapore cold brew brand launching a matte black can. Audience: 20-35 office crowd doomscrolling at 3pm. Feel: the exact moment cold caffeine hits. Premium but not corporate. End on the can.',
    amountUsd: 380,
  },
  {
    client: 'NightRunner',
    title: '5s hype bumper: midnight sneaker drop',
    brief:
      'Streetwear sneaker drop, neon-on-black city energy, reflective fabric catching light. Audience: sneakerheads on IG reels. Feel: adrenaline before the drop timer hits zero. End on the shoe.',
    amountUsd: 420,
  },
  {
    client: 'BUIDL OPC SG',
    title: '5s teaser: hackathon aftermovie',
    brief:
      'One-day AI hackathon in Singapore, 300 builders, terminal-green on black aesthetic, laptops, code, energy drinks, the 6pm submission rush. Feel: building the future in one room. End on a glowing screen.',
    amountUsd: 250,
  },
]

// ============================== store singleton ==============================

const DATA_DIR = path.join(process.cwd(), 'data')
const STATE_PATH = path.join(DATA_DIR, 'state.json')
const MEDIA_DIR = path.join(process.cwd(), 'public', 'media')

type Store = {
  state: State
  agents: AgentDef[]
  seq: number
  saveTimer: NodeJS.Timeout | null
}

function freshState(): State {
  return { orders: [], events: [], revenue: 0, delivered: 0, playbook: DEFAULT_PLAYBOOK }
}

function createStore(): Store {
  const store: Store = {
    state: freshState(),
    agents: WORKERS.map((w) => ({ ...w })),
    seq: 1,
    saveTimer: null,
  }
  try {
    const disk = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'))
    if (disk.schema === 2) {
      store.state = { ...freshState(), ...disk.state }
      for (const o of store.state.orders) {
        if (['concepting', 'jury', 'producing', 'revising'].includes(o.status)) {
          o.status = o.drafts?.length === 3 && o.ranking?.length ? 'review' : 'inbox'
        }
      }
      if (disk.agents) {
        for (const a of store.agents) {
          const d = disk.agents.find((x: AgentDef) => x.id === a.id)
          if (d) {
            a.reputation = d.reputation
            a.delivered = d.delivered
          }
          a.status = 'idle'
        }
      }
      store.seq = disk.seq ?? store.state.orders.length + 1
    }
  } catch {
    /* first boot or old schema: start fresh */
  }
  return store
}

const g = globalThis as unknown as { __solocorp?: Store }
g.__solocorp ??= createStore()
const S = g.__solocorp

export function getStore() {
  return S
}

function saveSoon() {
  if (S.saveTimer) return
  S.saveTimer = setTimeout(() => {
    S.saveTimer = null
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      fs.writeFileSync(
        STATE_PATH,
        JSON.stringify({ schema: 2, state: S.state, agents: S.agents, seq: S.seq }, null, 1),
      )
    } catch (e) {
      console.error('[store] persist failed', e)
    }
  }, 400)
}

export function ev(tag: string, text: string, orderId?: string) {
  S.state.events.unshift({ t: Date.now(), tag, text, orderId })
  if (S.state.events.length > 300) S.state.events.length = 300
  saveSoon()
}

function agent(id: string) {
  return S.agents.find((a) => a.id === id)!
}

// ============================== prompts ==============================

function workerSystem(w: AgentDef, playbook: string) {
  return `You are ${w.name}, ${w.role} at SoloCorp Studio, a one-person ad studio where a human CEO directs AI creative agents. Your signature style: ${w.style}.

The CEO Playbook below is the human founder's creative quality bar. It overrides everything:
${playbook}

Task: produce ONE ad concept for the client brief. Reply ONLY with minified JSON, no markdown fences, exactly this shape:
{"concept":"two word name","hook":"what stops the scroll in the first half second, one sentence","beats":["beat 1","beat 2","beat 3"],"style":"visual treatment in ten words","video_prompt":"60-100 word English prompt for a text-to-video model: one continuous shot, concrete subject and setting, explicit camera movement, lighting, mood, pacing, photorealistic detail. No on-screen text, no logos, no brand names, no watermarks."}`
}

function orderUser(o: Order) {
  let u = `Client: ${o.client}\nOrder: ${o.title}\nBudget: $${o.amountUsd}\nBrief: ${o.brief}`
  if (o.feedback && o.revision > 0) {
    u += `\n\nCEO REVISION FEEDBACK (rev ${o.revision}), address every point in a new concept JSON:\n${o.feedback}`
  }
  return u
}

function judgeSystem(j: { name: string; criterion: string }) {
  return `You are ${j.name} on the creative jury of SoloCorp Studio. Two anonymous ad concepts (A and B) answer the same paid client brief. Your single criterion: ${j.criterion}.

Reply ONLY with minified JSON: {"winner":"A"|"B","reason":"one crisp sentence, max 18 words"}`
}

function duelUser(o: Order, a: Draft, b: Draft) {
  return `Brief: ${o.title}. ${o.brief.slice(0, 400)}\n\n--- CONCEPT A ---\n${JSON.stringify(a.concept, null, 1)}\n\n--- CONCEPT B ---\n${JSON.stringify(b.concept, null, 1)}`
}

// ============================== parsing & fallbacks ==============================

function parseConcept(raw: string, w: AgentDef, o: Order): Concept {
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      if (p.video_prompt) {
        return {
          concept: String(p.concept || 'untitled').slice(0, 60),
          hook: String(p.hook || '').slice(0, 200),
          beats: Array.isArray(p.beats) ? p.beats.map((b: unknown) => String(b).slice(0, 140)).slice(0, 4) : [],
          style: String(p.style || '').slice(0, 120),
          video_prompt: String(p.video_prompt).slice(0, 900),
        }
      }
    }
  } catch {
    /* fall through */
  }
  return fallbackConcept(w, o)
}

function fallbackConcept(w: AgentDef, o: Order): Concept {
  return {
    concept: `${w.name} fallback`,
    hook: 'Product macro with dramatic light, offline fallback concept.',
    beats: ['macro texture reveal', 'slow orbital move', 'hero shot'],
    style: w.style.split(':')[0],
    video_prompt: `Macro product shot related to: ${o.title}. Dramatic rim lighting, slow orbital camera move, premium commercial aesthetic, shallow depth of field, photorealistic, moody atmosphere, single continuous shot.`,
  }
}

function fallbackVerdict(): string {
  return '{"winner":"A","reason":"Offline fallback verdict, first concept retained."}'
}

// ============================== pipeline ==============================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pace(cached: boolean, baseMs: number, jitterMs: number) {
  if (cached) await sleep(baseMs + Math.random() * jitterMs)
}

async function pooled<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const idx = next++
        results[idx] = await tasks[idx]()
      }
    }),
  )
  return results
}

async function conceptOne(o: Order, w: AgentDef): Promise<Draft> {
  w.status = 'working'
  ev(w.tag, `${w.name} is concepting "${o.title}"${o.revision ? ` rev ${o.revision}` : ''}`, o.id)
  const key = cacheKey('concept', o.title, w.id, o.revision)
  const { content, cached } = await reliable(
    key,
    () => chatOpenAI({ system: workerSystem(w, S.state.playbook), user: orderUser(o), maxTokens: 2200 }),
    () => JSON.stringify(fallbackConcept(w, o)),
  )
  await pace(cached, 2000, 3500)
  w.status = 'idle'
  const concept = parseConcept(content, w, o)
  ev(w.tag, `${w.name} pitched "${concept.concept}": ${concept.hook.slice(0, 80)}`, o.id)
  return { agentId: w.id, content, concept, cached }
}

async function runJury(o: Order) {
  o.status = 'jury'
  ev('JURY', `Creative jury convened for "${o.title}": 3 pairwise duels x ${JUDGES.length} Claude judges`, o.id)
  saveSoon()

  const pairs: [number, number][] = [
    [0, 1],
    [1, 2],
    [0, 2],
  ]
  const duelTasks = pairs.flatMap(([i, j]) =>
    JUDGES.map((judge) => async (): Promise<Duel> => {
      const A = o.drafts[i]
      const B = o.drafts[j]
      const key = cacheKey('duel', o.title, A.agentId, B.agentId, judge.id, o.revision)
      const { content, cached } = await reliable(
        key,
        () => chatClaude({ system: judgeSystem(judge), user: duelUser(o, A, B) }),
        fallbackVerdict,
      )
      await pace(cached, 800, 1600)
      let winner = A.agentId
      let reason = 'stronger concept coverage'
      try {
        const m = content.match(/\{[\s\S]*\}/)
        if (m) {
          const parsed = JSON.parse(m[0])
          winner = parsed.winner === 'B' ? B.agentId : A.agentId
          if (parsed.reason) reason = String(parsed.reason).slice(0, 140)
        }
      } catch {
        /* keep defaults */
      }
      ev(
        'DUEL',
        `${agent(A.agentId).name} vs ${agent(B.agentId).name}, ${judge.name} -> ${agent(winner).name}: ${reason}`,
        o.id,
      )
      return { a: A.agentId, b: B.agentId, winner, judge: judge.name, reason }
    }),
  )

  o.duels = await pooled(duelTasks, 3)

  const ids = o.drafts.map((d) => d.agentId)
  const comparisons: Comparison[] = o.duels.map((d) => ({
    winner: d.winner,
    loser: d.winner === d.a ? d.b : d.a,
  }))
  const scores = bradleyTerry(ids, comparisons)
  o.ranking = ids
    .map((id) => ({
      agentId: id,
      score: scores[id],
      wins: o.duels.filter((d) => d.winner === id).length,
    }))
    .sort((x, y) => y.score - x.score)

  o.winnerAgentId = o.ranking[0].agentId
  agent(o.winnerAgentId).reputation += 2
  ev(
    'RANK',
    `Bradley-Terry verdict: ${agent(o.winnerAgentId).name} wins with ${(o.ranking[0].score * 100).toFixed(0)}% strength, concept goes to production`,
    o.id,
  )
  saveSoon()
}

async function runProduction(o: Order) {
  const winner = o.drafts.find((d) => d.agentId === o.winnerAgentId)!
  o.status = 'producing'
  o.videoProgress = 0
  o.videoNote = undefined
  ev('PROD', `Studio rendering "${winner.concept.concept}" (Seedance 2.0, 5s vertical)`, o.id)
  saveSoon()

  const vKey = cacheKey('video', o.title, o.winnerAgentId ?? '', o.revision)
  const fileName = `${o.id}_r${o.revision}.mp4`
  const absPath = path.join(MEDIA_DIR, fileName)

  // cache replay: same title + winner + revision already rendered on disk
  const { cachedVideoFile } = readVideoCache(vKey)
  if (cachedVideoFile && fs.existsSync(path.join(MEDIA_DIR, cachedVideoFile))) {
    for (const p of [12, 34, 58, 79, 96]) {
      o.videoProgress = p
      saveSoon()
      await sleep(1200 + Math.random() * 900)
    }
    o.videoFile = `/media/${cachedVideoFile}`
    o.videoProgress = 100
    o.status = 'review'
    ev('GATE', `Render complete, cut is on the CEO desk for acceptance`, o.id)
    saveSoon()
    return
  }

  try {
    let lastLogged = -20
    await generateVideo(
      winner.concept.video_prompt,
      absPath,
      (pct) => {
        o.videoProgress = pct
        if (pct - lastLogged >= 20 && pct < 100) {
          lastLogged = pct
          ev('PROD', `Rendering ${pct}%`, o.id)
        }
        saveSoon()
      },
      { duration: 5, ratio: '9:16', model: VIDEO_MODEL_FAST, maxWaitS: 420 },
    )
    o.videoFile = `/media/${fileName}`
    o.videoProgress = 100
    writeVideoCache(vKey, fileName)
    o.status = 'review'
    ev('GATE', `Render complete, cut is on the CEO desk for acceptance`, o.id)
  } catch (e) {
    console.error('[video] render failed:', (e as Error).message)
    o.videoNote = `Render failed (${(e as Error).message.slice(0, 80)}). Concept and storyboard ready for review.`
    o.videoProgress = undefined
    o.status = 'review'
    ev('ERR', `Render failed for "${o.title}", concept sent to gate without footage`, o.id)
  }
  saveSoon()
}

// video cache index lives inside data/video-cache.json
const VIDEO_CACHE_PATH = path.join(DATA_DIR, 'video-cache.json')
function readVideoCache(key: string): { cachedVideoFile?: string } {
  try {
    const idx = JSON.parse(fs.readFileSync(VIDEO_CACHE_PATH, 'utf-8'))
    return { cachedVideoFile: idx[key] }
  } catch {
    return {}
  }
}
function writeVideoCache(key: string, fileName: string) {
  let idx: Record<string, string> = {}
  try {
    idx = JSON.parse(fs.readFileSync(VIDEO_CACHE_PATH, 'utf-8'))
  } catch {
    /* fresh */
  }
  idx[key] = fileName
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(VIDEO_CACHE_PATH, JSON.stringify(idx, null, 1))
  } catch {
    /* non-fatal */
  }
}

export async function runPipeline(orderId: string) {
  const o = S.state.orders.find((x) => x.id === orderId)
  if (!o) return
  try {
    o.status = 'concepting'
    o.error = undefined
    saveSoon()
    o.drafts = await Promise.all(WORKERS.map((w) => conceptOne(o, agent(w.id))))
    await runJury(o)
    await runProduction(o)
  } catch (e) {
    o.error = (e as Error).message
    o.status = o.drafts?.length === 3 ? 'review' : 'inbox'
    ev('ERR', `Pipeline error on "${o.title}": ${o.error?.slice(0, 120)}`, o.id)
    saveSoon()
  }
}

export async function runRevision(orderId: string, feedback: string) {
  const o = S.state.orders.find((x) => x.id === orderId)
  if (!o || !o.winnerAgentId) return
  try {
    o.status = 'revising'
    o.revision += 1
    o.feedback = feedback
    const w = agent(o.winnerAgentId)
    ev('REV', `CEO sent "${o.title}" back to ${w.name} with notes`, o.id)
    saveSoon()

    w.status = 'working'
    const key = cacheKey('concept-rev', o.title, w.id, o.revision)
    const prev = o.drafts.find((d) => d.agentId === w.id)!
    const { content, cached } = await reliable(
      key,
      () =>
        chatOpenAI({
          system: workerSystem(w, S.state.playbook),
          user: `${orderUser(o)}\n\nYOUR PREVIOUS CONCEPT (improve it, keep what worked):\n${JSON.stringify(prev.concept)}`,
          maxTokens: 2200,
        }),
      () => JSON.stringify(prev.concept),
    )
    await pace(cached, 1500, 2500)
    w.status = 'idle'
    prev.content = content
    prev.concept = parseConcept(content, w, o)
    prev.revised = true
    prev.cached = cached
    ev(w.tag, `${w.name} delivered revised concept "${prev.concept.concept}", re-rendering`, o.id)
    saveSoon()
    await runProduction(o)
  } catch (e) {
    o.status = 'review'
    o.error = (e as Error).message
    saveSoon()
  }
}

export function approveOrder(orderId: string) {
  const o = S.state.orders.find((x) => x.id === orderId)
  if (!o || o.status !== 'review') return
  const seq = S.state.delivered + 1
  const hash = crypto
    .createHash('sha256')
    .update(o.id + o.title)
    .digest('hex')
  o.invoice = {
    id: `INV-2026-${String(seq).padStart(4, '0')}`,
    paidAt: Date.now(),
    ref: `0x${hash.slice(0, 40)} (Base Sepolia, simulated x402 settlement)`,
  }
  o.status = 'delivered'
  S.state.revenue += o.amountUsd
  S.state.delivered += 1
  if (o.winnerAgentId) {
    const w = agent(o.winnerAgentId)
    w.delivered += 1
    w.reputation += 3
  }
  ev('PAID', `CEO accepted "${o.title}". Escrow released, treasury +$${o.amountUsd}, ${o.invoice.id} sent to ${o.client}`, o.id)
  saveSoon()
}

export function createOrder(input: {
  client: string
  title: string
  brief: string
  amountUsd: number
}): Order {
  const o: Order = {
    id: `ord_${S.seq++}_${Date.now().toString(36)}`,
    client: input.client.slice(0, 60) || 'Client',
    title: input.title.slice(0, 120) || 'Untitled order',
    brief: input.brief.slice(0, 2000),
    amountUsd: Math.max(1, Math.min(100000, Math.round(input.amountUsd || 100))),
    status: 'inbox',
    createdAt: Date.now(),
    revision: 0,
    drafts: [],
    duels: [],
    ranking: [],
  }
  S.state.orders.unshift(o)
  ev('ESCROW', `New brief from ${o.client}: "${o.title}", $${o.amountUsd} locked in escrow`, o.id)
  saveSoon()
  return o
}

export function resetCompany() {
  S.state = freshState()
  S.agents = WORKERS.map((w) => ({ ...w }))
  S.seq = 1
  ev('BOOK', 'Company reset, fresh books')
  saveSoon()
}

export function publicState() {
  return {
    company: COMPANY,
    state: S.state,
    agents: S.agents,
    judges: JUDGES.map((j) => j.name),
    templates: TEMPLATES,
  }
}
