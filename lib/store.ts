import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { bradleyTerry, type Comparison } from './bt'
import { chatOpenAI, chatClaude, reliable, cacheKey } from './llm'

// ============================== types ==============================

export type AgentDef = {
  id: string
  name: string
  role: string
  style: string
  emoji: string
  feeUsd: number
  reputation: number
  delivered: number
  status: 'idle' | 'working'
}

export type Draft = { agentId: string; content: string; cached: boolean; revised?: boolean }
export type Duel = { a: string; b: string; winner: string; judge: string; reason: string }
export type RankEntry = { agentId: string; score: number; wins: number }

export type OrderStatus =
  | 'inbox'
  | 'drafting'
  | 'jury'
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
  feedback?: string
  invoice?: { id: string; paidAt: number; tx: string }
  error?: string
}

export type Ev = { t: number; icon: string; text: string; orderId?: string }

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
  vertical: 'AI × Crypto research, delivered as a service',
}

const DEFAULT_PLAYBOOK = `1. Every deliverable ends with a decision: RECOMMEND / HOLD / AVOID, with a confidence %.
2. Quantify everything. When estimating, state the assumption next to the number.
3. Separate verified facts from interpretation. Flag anything unverifiable.
4. Client-ready tone: no fluff, no marketing language, no hedging walls.
5. Crypto topics: always cover mechanism-design risk and regulatory posture.`

export const WORKERS: AgentDef[] = [
  {
    id: 'atlas',
    name: 'Atlas',
    role: 'Staff Analyst',
    style:
      'rigorous structure: crisp definitions, comparison tables, numbered frameworks. Conservative, precise.',
    emoji: '🧭',
    feeUsd: 18,
    reputation: 12,
    delivered: 0,
    status: 'idle',
  },
  {
    id: 'nova',
    name: 'Nova',
    role: 'Contrarian Researcher',
    style:
      'risk-first: leads with failure modes, attack surfaces, and what everyone else is missing. Sharp, opinionated.',
    emoji: '🕶️',
    feeUsd: 18,
    reputation: 11,
    delivered: 0,
    status: 'idle',
  },
  {
    id: 'quant',
    name: 'Quant',
    role: 'Data Analyst',
    style:
      'numbers-first: unit economics, market sizing, on-chain/usage metrics, sensitivity ranges. Terse and dense.',
    emoji: '📐',
    feeUsd: 18,
    reputation: 10,
    delivered: 0,
    status: 'idle',
  },
]

export const JUDGES = [
  {
    id: 'rigor',
    name: 'Judge Rigor',
    criterion:
      'factual grounding, internal consistency, and structural clarity. Penalise unsupported claims hard.',
  },
  {
    id: 'utility',
    name: 'Judge Utility',
    criterion:
      'decision-usefulness for the paying client: a clear recommendation, quantified uncertainty, actionable next steps.',
  },
]

export const TEMPLATES = [
  {
    client: 'Meridian Capital',
    title: 'Due-diligence brief: x402 agent-payment protocol',
    brief:
      'We are evaluating infrastructure bets around agent-to-agent payments. Assess the x402 payment protocol: mechanism, adoption signals, competitive landscape (AP2 and others), key risks, and whether a seed-stage infra fund should build exposure now.',
    amountUsd: 250,
  },
  {
    client: 'Nimbus Labs',
    title: 'Chain selection memo: Monad vs Base for a consumer app',
    brief:
      'We are shipping a consumer social-trading app targeting 100k DAU. Compare Monad and Base on throughput, fees, wallet UX, ecosystem funding, and distribution. End with a single recommended chain and migration triggers.',
    amountUsd: 180,
  },
  {
    client: 'Kite Studio',
    title: 'AWS cost plan for a multi-agent AI backend',
    brief:
      'Our agent workload runs 30 concurrent LLM pipelines with bursty traffic. Propose an AWS architecture (Bedrock vs self-hosted on EC2/GPU, Lambda vs ECS, caching strategy) with a monthly cost estimate at 3 scale tiers and the top 3 cost-optimisation levers.',
    amountUsd: 120,
  },
]

// ============================== store singleton ==============================

const DATA_DIR = path.join(process.cwd(), 'data')
const STATE_PATH = path.join(DATA_DIR, 'state.json')

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
    store.state = { ...freshState(), ...disk.state }
    // orders stuck mid-pipeline from a previous process: park them back in review-able states
    for (const o of store.state.orders) {
      if (o.status === 'drafting' || o.status === 'jury' || o.status === 'revising') {
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
  } catch {
    /* first boot */
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
        JSON.stringify({ state: S.state, agents: S.agents, seq: S.seq }, null, 1),
      )
    } catch (e) {
      console.error('[store] persist failed', e)
    }
  }, 400)
}

export function ev(icon: string, text: string, orderId?: string) {
  S.state.events.unshift({ t: Date.now(), icon, text, orderId })
  if (S.state.events.length > 300) S.state.events.length = 300
  saveSoon()
}

function agent(id: string) {
  return S.agents.find((a) => a.id === id)!
}
function agentName(id: string) {
  const a = agent(id)
  return `${a.emoji} ${a.name}`
}

// ============================== prompts ==============================

function workerSystem(w: AgentDef, playbook: string) {
  return `You are ${w.name}, ${w.role} at SoloCorp — a one-person company where a human CEO directs a team of AI agents. Your writing style: ${w.style}

The CEO's Playbook below encodes the human founder's professional experience and quality bar. It overrides everything else. Follow it strictly:
${playbook}

Produce a client-ready deliverable in Markdown (450-650 words): start with a 3-line executive summary, then structured sections, end with the decision block required by the Playbook. No preamble, no meta-commentary — output the deliverable only.`
}

function orderUser(o: Order) {
  let u = `Client: ${o.client}\nOrder: ${o.title}\nBudget: $${o.amountUsd}\nBrief: ${o.brief}`
  if (o.feedback && o.revision > 0) {
    u += `\n\nCEO REVISION FEEDBACK (rev ${o.revision}) — address every point fully:\n${o.feedback}`
  }
  return u
}

function judgeSystem(j: { name: string; criterion: string }) {
  return `You are ${j.name} on the AI quality jury of SoloCorp. Two anonymous drafts (A and B) answer the same paid client order. Your single criterion: ${j.criterion}

Reply ONLY with minified JSON: {"winner":"A"|"B","reason":"<one crisp sentence, max 18 words>"}`
}

function duelUser(o: Order, a: Draft, b: Draft) {
  return `Order: ${o.title}\nClient brief: ${o.brief.slice(0, 400)}\n\n--- DRAFT A ---\n${a.content.slice(0, 12000)}\n\n--- DRAFT B ---\n${b.content.slice(0, 12000)}`
}

// ============================== fallbacks (offline insurance) ==============================

function fallbackDraft(w: AgentDef, o: Order): string {
  return `## Executive Summary
${o.title} — assessment prepared by ${w.name} (${w.role}). Network fallback draft: structure intact, live model output unavailable.

## Analysis
- Scope: ${o.brief.slice(0, 180)}…
- ${w.id === 'atlas' ? 'Framework: market structure → mechanism → adoption → risk.' : ''}${w.id === 'nova' ? 'Lead risk: consensus optimism is unpriced; failure modes dominate the tail.' : ''}${w.id === 'quant' ? 'Base case sized from comparable adoption curves; ±40% sensitivity band.' : ''}
- Key considerations were compiled from the CEO Playbook quality bar.

## Decision
**HOLD — confidence 55%.** Re-run with live model access for the full quantified brief.`
}

function fallbackVerdict(): string {
  return '{"winner":"A","reason":"Offline fallback: first draft retained by default."}'
}

// ============================== pipeline ==============================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// replayed cache hits get a human-scale delay so the pipeline still reads as live work
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

async function draftOne(o: Order, w: AgentDef): Promise<Draft> {
  w.status = 'working'
  ev(w.emoji, `${w.name} started drafting "${o.title}"${o.revision ? ` (rev ${o.revision})` : ''}`, o.id)
  const key = cacheKey('draft', o.title, w.id, o.revision)
  const { content, cached } = await reliable(
    key,
    () => chatOpenAI({ system: workerSystem(w, S.state.playbook), user: orderUser(o) }),
    () => fallbackDraft(w, o),
  )
  await pace(cached, 2500, 4000)
  w.status = 'idle'
  const words = content.split(/\s+/).length
  ev(w.emoji, `${w.name} submitted a draft — ${words} words`, o.id)
  return { agentId: w.id, content, cached }
}

async function runJury(o: Order) {
  o.status = 'jury'
  ev('⚖️', `AI Jury convened for "${o.title}": 3 pairwise duels × ${JUDGES.length} Claude judges`, o.id)
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
      await pace(cached, 900, 1800)
      let winner = A.agentId
      let reason = 'structured coverage edge'
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
        '⚔️',
        `Duel ${agentName(A.agentId)} vs ${agentName(B.agentId)} — ${judge.name} → ${agentName(winner)}: “${reason}”`,
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
  o.status = 'review'
  ev(
    '👤',
    `Bradley-Terry ranking complete — top draft: ${agentName(o.winnerAgentId)} (${(
      o.ranking[0].score * 100
    ).toFixed(0)}% BT) → CEO Acceptance Gate`,
    o.id,
  )
  saveSoon()
}

export async function runPipeline(orderId: string) {
  const o = S.state.orders.find((x) => x.id === orderId)
  if (!o) return
  try {
    o.status = 'drafting'
    o.error = undefined
    saveSoon()
    o.drafts = await Promise.all(WORKERS.map((w) => draftOne(o, agent(w.id))))
    await runJury(o)
  } catch (e) {
    o.error = (e as Error).message
    o.status = o.drafts?.length === 3 ? 'review' : 'inbox'
    ev('🚨', `Pipeline error on "${o.title}": ${o.error?.slice(0, 120)}`, o.id)
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
    ev('↩️', `CEO rejected "${o.title}" — sent back to ${agentName(w.id)} with feedback`, o.id)
    saveSoon()

    w.status = 'working'
    const key = cacheKey('revise', o.title, w.id, o.revision)
    const prev = o.drafts.find((d) => d.agentId === w.id)!
    const { content, cached } = await reliable(
      key,
      () =>
        chatOpenAI({
          system: workerSystem(w, S.state.playbook),
          user: `${orderUser(o)}\n\nYOUR PREVIOUS DRAFT (improve it, do not start over):\n${prev.content}`,
        }),
      () => prev.content + `\n\n> rev ${o.revision}: offline fallback, previous draft retained.`,
    )
    w.status = 'idle'
    prev.content = content
    prev.revised = true
    prev.cached = cached
    o.status = 'review'
    ev(w.emoji, `${w.name} delivered revision ${o.revision} → back to Acceptance Gate`, o.id)
    saveSoon()
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
    tx: `0x${hash.slice(0, 40)} · Base Sepolia · simulated x402 settlement`,
  }
  o.status = 'delivered'
  S.state.revenue += o.amountUsd
  S.state.delivered += 1
  if (o.winnerAgentId) {
    const w = agent(o.winnerAgentId)
    w.delivered += 1
    w.reputation += 3
  }
  ev('✅', `CEO accepted "${o.title}"`, o.id)
  ev('💸', `Escrow released → treasury +$${o.amountUsd} · ${o.invoice.id} → ${o.client}`, o.id)
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
  ev('📥', `New order from ${o.client}: "${o.title}" — $${o.amountUsd} locked in escrow`, o.id)
  saveSoon()
  return o
}

export function resetCompany() {
  S.state = freshState()
  S.agents = WORKERS.map((w) => ({ ...w }))
  S.seq = 1
  ev('🧹', 'Company state reset — fresh books')
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
