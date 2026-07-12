import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { bradleyTerry, type Comparison } from './bt'
import { chatOpenAI, chatClaude, reliable, cacheKey } from './llm'
import { generateVideo, VIDEO_MODEL_MINI } from './video'
import { generateImage } from './image'
import { chainEnabled, settleUsdc } from './chain'
import { startEscrowWatch } from './escrowWatch'

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
  | 'greenlight'
  | 'producing'
  | 'review'
  | 'revising'
  | 'delivered'

export type Order = {
  id: string
  client: string
  title: string
  brief: string
  vertical: string
  amountUsd: number
  cogsUsd: number
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
  posterFile?: string
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
  name: 'Aria Studio',
  ceo: 'alertcat',
  vertical: 'a solo performance: one human, an ensemble of agents, real footage, real invoices',
}

// estimated unit costs, shown to make the margin story concrete
export const UNIT_COSTS = {
  concepts: 0.02, // 3 director pitches, gpt-5.4-mini
  jury: 0.01, // 6 pairwise duels, claude-sonnet-5 on own relay
  render: 0.25, // seedance 2.0 mini, 5s 720p vertical
  poster: 0.02, // gpt-image-2 campaign poster
}

const DEFAULT_PLAYBOOK = `1. First frame hooks in half a second. No slow fades, no logo intros.
2. One idea per spot. If the concept needs a sentence of explanation, kill it.
3. Native vertical 9:16, designed for sound-off viewing.
4. Photorealistic commercial craft: real light, real materials, believable people. No neon gimmicks unless the brief asks.
5. Never render on-screen text, UI, logos or celebrity likeness.
6. End on the subject hero shot. Recall beats cleverness.`

export const WORKERS: AgentDef[] = [
  {
    id: 'hale',
    tag: 'HL',
    name: 'HALE',
    role: 'Product Storyteller',
    style:
      'benefit-led product commercials: studio-grade macro shots, controlled lighting, satisfying physical detail (pour, crack, texture), premium minimalism in the Apple and Nike tradition',
    feeUsd: 25,
    reputation: 10,
    delivered: 0,
    status: 'idle',
  },
  {
    id: 'wander',
    tag: 'WN',
    name: 'WANDER',
    role: 'Travel & Lifestyle Director',
    style:
      'warm documentary realism: golden hour, drone establishing moves, human moments in real places, National Geographic meets tourism-board campaign',
    feeUsd: 25,
    reputation: 10,
    delivered: 0,
    status: 'idle',
  },
  {
    id: 'sage',
    tag: 'SA',
    name: 'SAGE',
    role: 'Explainer Director',
    style:
      'science and how-it-works visuals: macro and slow-motion physical phenomena, clean visual metaphors, crisp educational pacing in the Kurzgesagt and BBC Earth tradition, photorealistic not cartoon',
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
      'client fit and message clarity: does this concept deliver the brief and the brand promise, is it feasible as a single 5 second generated shot, would the paying client sign off',
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
    vertical: 'product ad',
    title: '5s vertical bumper: cold brew can launch',
    brief:
      'Singapore cold brew brand launching a matte black can. Audience: 20-35 office crowd doomscrolling at 3pm. Feel: the exact moment cold caffeine hits. Premium but not corporate. End on the can.',
    amountUsd: 380,
  },
  {
    client: 'Visit Palawan',
    vertical: 'travel promo',
    title: '5s destination teaser: island lagoon',
    brief:
      'Tourism board wants a scroll-stopper for the lagoon season. Audience: SEA city dwellers planning long weekends. Feel: the second you decide to book, turquoise water, limestone cliffs, one human moment. End wide on the lagoon.',
    amountUsd: 450,
  },
  {
    client: 'SlateLab',
    vertical: 'science explainer',
    title: '5s explainer hook: how lightning forms',
    brief:
      'Science channel needs a cold-open hook for a lightning episode. Audience: curious 16-30, sound off. Feel: awe plus one clear visual idea (charge building, then release). Photorealistic storm craft, not cartoon. End on the strike.',
    amountUsd: 300,
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
    if (disk.schema === 3) {
      store.state = { ...freshState(), ...disk.state }
      for (const o of store.state.orders) {
        if (['concepting', 'jury', 'producing', 'revising'].includes(o.status)) {
          o.status = o.drafts?.length === 3 && o.ranking?.length ? 'greenlight' : 'inbox'
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
        JSON.stringify({ schema: 3, state: S.state, agents: S.agents, seq: S.seq }, null, 1),
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
  return `You are ${w.name}, ${w.role} at Aria Studio, a one-person media production company where a human CEO directs AI creative agents. Your signature craft: ${w.style}.

The CEO Playbook below is the human founder's creative quality bar. It overrides everything:
${playbook}

Task: produce ONE concept for the client brief. Reply ONLY with minified JSON, no markdown fences, exactly this shape:
{"concept":"two word name","hook":"what stops the scroll in the first half second, one sentence","beats":["beat 1","beat 2","beat 3"],"style":"visual treatment in ten words","video_prompt":"60-100 word English prompt for a text-to-video model: one continuous photorealistic shot, concrete subject and setting, explicit camera movement, lighting, mood, pacing. No on-screen text, no logos, no brand names, no watermarks."}`
}

function orderUser(o: Order) {
  let u = `Client: ${o.client}\nVertical: ${o.vertical}\nOrder: ${o.title}\nBudget: $${o.amountUsd}\nBrief: ${o.brief}`
  if (o.feedback && o.revision > 0) {
    u += `\n\nCEO REVISION FEEDBACK (rev ${o.revision}), address every point in a new concept JSON:\n${o.feedback}`
  }
  return u
}

function judgeSystem(j: { name: string; criterion: string }) {
  return `You are ${j.name} on the creative jury of Aria Studio. Two anonymous concepts (A and B) answer the same paid client brief. Your single criterion: ${j.criterion}.

Reply ONLY with minified JSON: {"winner":"A"|"B","reason":"one crisp sentence, max 18 words"}`
}

function duelUser(o: Order, a: Draft, b: Draft) {
  return `Brief: ${o.title}. ${o.brief.slice(0, 400)}\n\n--- CONCEPT A ---\n${JSON.stringify(a.concept, null, 1)}\n\n--- CONCEPT B ---\n${JSON.stringify(b.concept, null, 1)}`
}

function posterPrompt(o: Order, c: Concept) {
  return `Premium campaign key visual for a ${o.vertical}: ${c.hook} Visual treatment: ${c.style}. Cinematic lighting, photorealistic, clean composition with generous negative space, no text, no words, no logos, no watermark.`
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
          beats: Array.isArray(p.beats)
            ? p.beats.map((b: unknown) => String(b).slice(0, 140)).slice(0, 4)
            : [],
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
    hook: 'Hero subject in dramatic natural light, offline fallback concept.',
    beats: ['texture reveal', 'slow camera move', 'hero shot'],
    style: w.style.split(':')[0],
    video_prompt: `Photorealistic commercial shot related to: ${o.title}. Natural dramatic lighting, slow deliberate camera move, premium production craft, shallow depth of field, single continuous shot.`,
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
    () =>
      chatOpenAI({ system: workerSystem(w, S.state.playbook), user: orderUser(o), maxTokens: 2200 }),
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

  o.cogsUsd += UNIT_COSTS.concepts + UNIT_COSTS.jury
  o.status = 'greenlight'
  ev(
    'RANK',
    `Bradley-Terry ranking in: ${agent(o.ranking[0].agentId).name} leads at ${(o.ranking[0].score * 100).toFixed(0)}%. Awaiting CEO greenlight before render spend`,
    o.id,
  )
  saveSoon()
}

export function greenlightOrder(orderId: string, agentId?: string) {
  const o = S.state.orders.find((x) => x.id === orderId)
  if (!o || o.status !== 'greenlight') return
  const pick = agentId && o.drafts.some((d) => d.agentId === agentId) ? agentId : o.ranking[0].agentId
  o.winnerAgentId = pick
  agent(pick).reputation += 2
  const overrode = pick !== o.ranking[0].agentId
  ev(
    'GLGHT',
    `CEO greenlit ${agent(pick).name}${overrode ? ' (overriding the jury pick)' : ''}, "${o.drafts.find((d) => d.agentId === pick)!.concept.concept}" goes to production`,
    o.id,
  )
  saveSoon()
  void runProduction(o)
}

async function runProduction(o: Order) {
  const winner = o.drafts.find((d) => d.agentId === o.winnerAgentId)!
  o.status = 'producing'
  o.videoProgress = 0
  o.videoNote = undefined
  ev('PROD', `Studio rendering "${winner.concept.concept}" (Seedance 2.0 mini, 5s vertical) plus campaign poster (gpt-image-2)`, o.id)
  saveSoon()

  const vKey = cacheKey('video', o.title, o.winnerAgentId ?? '', o.revision)
  const pKey = cacheKey('poster', o.title, o.winnerAgentId ?? '', o.revision)
  const videoName = `${o.id}_r${o.revision}.mp4`
  const posterName = `${o.id}_r${o.revision}.png`

  const posterTask = (async () => {
    const { cachedVideoFile: cachedPoster } = readMediaCache(pKey)
    if (cachedPoster && fs.existsSync(path.join(MEDIA_DIR, cachedPoster))) {
      await sleep(2500 + Math.random() * 2000)
      o.posterFile = `/media/${cachedPoster}`
      ev('IMG', `Campaign poster ready`, o.id)
      saveSoon()
      return
    }
    try {
      await generateImage(posterPrompt(o, winner.concept), path.join(MEDIA_DIR, posterName))
      o.posterFile = `/media/${posterName}`
      o.cogsUsd += UNIT_COSTS.poster
      writeMediaCache(pKey, posterName)
      ev('IMG', `Campaign poster ready (gpt-image-2)`, o.id)
    } catch (e) {
      console.error('[image] poster failed:', (e as Error).message)
      ev('ERR', `Poster generation failed, continuing with video only`, o.id)
    }
    saveSoon()
  })()

  const videoTask = (async () => {
    const { cachedVideoFile } = readMediaCache(vKey)
    if (cachedVideoFile && fs.existsSync(path.join(MEDIA_DIR, cachedVideoFile))) {
      for (const p of [14, 37, 61, 82, 97]) {
        o.videoProgress = p
        saveSoon()
        await sleep(1100 + Math.random() * 800)
      }
      o.videoFile = `/media/${cachedVideoFile}`
      o.videoProgress = 100
      return
    }
    let lastLogged = -20
    await generateVideo(
      winner.concept.video_prompt,
      path.join(MEDIA_DIR, videoName),
      (pct) => {
        o.videoProgress = pct
        if (pct - lastLogged >= 20 && pct < 100) {
          lastLogged = pct
          ev('PROD', `Rendering ${pct}%`, o.id)
        }
        saveSoon()
      },
      { duration: 5, ratio: '9:16', model: VIDEO_MODEL_MINI, maxWaitS: 420 },
    )
    o.videoFile = `/media/${videoName}`
    o.videoProgress = 100
    o.cogsUsd += UNIT_COSTS.render
    writeMediaCache(vKey, videoName)
  })()

  try {
    await Promise.all([videoTask, posterTask])
    o.status = 'review'
    ev('GATE', `Cut and key visual are on the CEO desk for final acceptance`, o.id)
  } catch (e) {
    console.error('[video] render failed:', (e as Error).message)
    o.videoNote = `Render failed (${(e as Error).message.slice(0, 80)}). Concept and poster ready for review.`
    o.videoProgress = undefined
    o.status = 'review'
    ev('ERR', `Render failed for "${o.title}", sent to gate without footage`, o.id)
  }
  saveSoon()
}

// media cache index lives inside data/video-cache.json
const VIDEO_CACHE_PATH = path.join(DATA_DIR, 'video-cache.json')
function readMediaCache(key: string): { cachedVideoFile?: string } {
  try {
    const idx = JSON.parse(fs.readFileSync(VIDEO_CACHE_PATH, 'utf-8'))
    return { cachedVideoFile: idx[key] }
  } catch {
    return {}
  }
}
function writeMediaCache(key: string, fileName: string) {
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
  } catch (e) {
    o.error = (e as Error).message
    o.status = o.drafts?.length === 3 ? 'greenlight' : 'inbox'
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
    o.cogsUsd += UNIT_COSTS.concepts / 3
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
    ref: chainEnabled()
      ? 'Settling USDC on Base Sepolia...'
      : `0x${hash.slice(0, 40)} (Base Sepolia, simulated settlement)`,
  }
  if (chainEnabled()) {
    void (async () => {
      try {
        const r = await settleUsdc(o.amountUsd)
        if (o.invoice) o.invoice.ref = `${r.usdc} USDC on Base Sepolia: ${r.url}`
        ev('CHAIN', `On-chain settlement confirmed: ${r.usdc} USDC, tx ${r.hash.slice(0, 14)}...`, o.id)
      } catch (e) {
        if (o.invoice)
          o.invoice.ref = `0x${hash.slice(0, 40)} (Base Sepolia, simulated settlement; live tx failed: ${(e as Error).message.slice(0, 60)})`
        ev('ERR', `On-chain settlement failed, kept simulated record`, o.id)
      }
      saveSoon()
    })()
  }
  o.status = 'delivered'
  S.state.revenue += o.amountUsd
  S.state.delivered += 1
  if (o.winnerAgentId) {
    const w = agent(o.winnerAgentId)
    w.delivered += 1
    w.reputation += 3
  }
  const margin = o.amountUsd > 0 ? (((o.amountUsd - o.cogsUsd) / o.amountUsd) * 100).toFixed(1) : '0'
  ev(
    'PAID',
    `CEO accepted "${o.title}". Escrow released: +$${o.amountUsd}, COGS $${o.cogsUsd.toFixed(2)}, margin ${margin}%. ${o.invoice.id} sent to ${o.client}`,
    o.id,
  )
  saveSoon()
}

export function createOrder(input: {
  client: string
  title: string
  brief: string
  amountUsd: number
  vertical?: string
}): Order {
  const o: Order = {
    id: `ord_${S.seq++}_${Date.now().toString(36)}`,
    client: input.client.slice(0, 60) || 'Client',
    title: input.title.slice(0, 120) || 'Untitled order',
    brief: input.brief.slice(0, 2000),
    vertical: (input.vertical || 'custom').slice(0, 40),
    amountUsd: Math.max(1, Math.min(100000, Math.round(input.amountUsd || 100))),
    cogsUsd: 0,
    status: 'inbox',
    createdAt: Date.now(),
    revision: 0,
    drafts: [],
    duels: [],
    ranking: [],
  }
  S.state.orders.unshift(o)
  ev('ESCROW', `New brief from ${o.client} (${o.vertical}): "${o.title}", $${o.amountUsd} locked in escrow`, o.id)
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
  startEscrowWatch(ev)
  return {
    company: COMPANY,
    state: S.state,
    agents: S.agents,
    judges: JUDGES.map((j) => j.name),
    templates: TEMPLATES,
    unitCosts: UNIT_COSTS,
  }
}
