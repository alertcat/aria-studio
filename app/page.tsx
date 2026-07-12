'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, useReducedMotion, useMotionValue, useTransform, animate, AnimatePresence } from 'motion/react'
import {
  Play,
  CheckCircle,
  ArrowRight,
  ArrowUUpLeft,
  Scales,
  FilmSlate,
  Coins,
  UserCircleCheck,
  CircleNotch,
} from '@phosphor-icons/react'

// ---------- types mirrored from the server ----------
type Agent = {
  id: string
  tag: string
  name: string
  role: string
  feeUsd: number
  reputation: number
  delivered: number
  status: 'idle' | 'working'
}
type Concept = { concept: string; hook: string; beats: string[]; style: string; video_prompt: string }
type Draft = { agentId: string; content: string; concept: Concept; cached: boolean; revised?: boolean }
type Duel = { a: string; b: string; winner: string; judge: string; reason: string }
type RankEntry = { agentId: string; score: number; wins: number }
type OrderStatus =
  | 'inbox'
  | 'concepting'
  | 'jury'
  | 'greenlight'
  | 'producing'
  | 'review'
  | 'revising'
  | 'delivered'
type Order = {
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
  invoice?: { id: string; paidAt: number; ref: string }
}
type Ev = { t: number; tag: string; text: string; orderId?: string }
type ApiState = {
  company: { name: string; ceo: string; vertical: string }
  state: { orders: Order[]; events: Ev[]; revenue: number; delivered: number; playbook: string }
  agents: Agent[]
  judges: string[]
  templates: { client: string; vertical: string; title: string; brief: string; amountUsd: number }[]
  unitCosts: Record<string, number>
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  inbox: 'Queued',
  concepting: 'Concepting',
  jury: 'Jury in session',
  greenlight: 'Awaiting greenlight',
  producing: 'Rendering',
  review: 'At the gate',
  revising: 'Revising',
  delivered: 'Paid',
}

const TAG_STYLE: Record<string, string> = {
  PAID: 'text-emerald-400',
  CHAIN: 'text-emerald-400',
  GLGHT: 'text-emerald-300',
  GATE: 'text-zinc-100',
  DUEL: 'text-amber-300',
  RANK: 'text-amber-200',
  JURY: 'text-amber-300',
  REV: 'text-amber-400',
  ERR: 'text-red-400',
  PROD: 'text-zinc-300',
  IMG: 'text-zinc-300',
  ESCROW: 'text-zinc-200',
  BOOK: 'text-zinc-400',
}

const PORTRAIT: Record<string, string> = {
  hale: '/media/team-hale.png',
  wander: '/media/team-wander.png',
  sage: '/media/team-sage.png',
}

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString('en-GB', { hour12: false })
}
function money(n: number) {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function AnimatedMoney({ value }: { value: number }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => '$' + Math.round(v).toLocaleString())
  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [value, mv, reduce])
  return <motion.span>{text}</motion.span>
}

export default function Page() {
  const reduce = useReducedMotion()
  const [data, setData] = useState<ApiState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [showPlaybook, setShowPlaybook] = useState(false)
  const [playbookDraft, setPlaybookDraft] = useState<string | null>(null)
  const [custom, setCustom] = useState({
    client: '',
    title: '',
    brief: '',
    amountUsd: 350,
    vertical: 'product ad',
  })
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' })
      const json: ApiState = await res.json()
      setData(json)
      if (!selectedRef.current && json.state.orders.length > 0) {
        const prio = (s: OrderStatus) =>
          ({ greenlight: 0, review: 1, producing: 2, revising: 2, jury: 3, concepting: 4, inbox: 5, delivered: 6 })[s]
        const hot = [...json.state.orders].sort((a, b) => prio(a.status) - prio(b.status))[0]
        setSelectedId(hot.id)
      }
    } catch {
      /* transient */
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 1200)
    return () => clearInterval(id)
  }, [poll])

  const post = async (url: string, body?: unknown) => {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : '{}',
    })
    poll()
  }

  if (!data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <CircleNotch size={22} className="animate-spin text-zinc-600" />
      </div>
    )
  }

  const { state, agents, templates } = data
  const orders = state.orders
  const selected = orders.find((o) => o.id === selectedId) ?? null
  const agentOf = (id?: string) => agents.find((a) => a.id === id)
  const shipped = orders.filter((o) => o.status === 'delivered')
  const active = orders.filter((o) => o.status !== 'delivered')
  const cogsDelivered = shipped.reduce((s, o) => s + o.cogsUsd, 0)
  const grossMargin =
    state.revenue > 0 ? (((state.revenue - cogsDelivered) / state.revenue) * 100).toFixed(1) : null
  const winnerDraft = selected?.drafts.find((d) => d.agentId === selected.winnerAgentId)

  const enter = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const },
        }
  const inView = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.25 },
          transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
        }

  return (
    <div className="min-h-[100dvh]">
      {/* nav */}
      <nav className="sticky top-0 z-40 border-b border-white/5 bg-[#09090b]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-[4px] bg-emerald-400" />
            <span className="text-[16px] font-semibold tracking-tight">AAA Studio</span>
            <span className="mono hidden text-[11px] text-zinc-600 sm:inline">Agents. Ads. Accepted.</span>
          </div>
          <div className="mono flex items-center gap-5 text-[13px]">
            <span className="text-zinc-500">
              revenue <span className="font-medium text-emerald-400"><AnimatedMoney value={state.revenue} /></span>
            </span>
            <span className="hidden text-zinc-500 sm:inline">
              margin <span className="font-medium text-zinc-100">{grossMargin ? `${grossMargin}%` : '--'}</span>
            </span>
            <span className="hidden text-zinc-500 md:inline">
              shipped <span className="font-medium text-zinc-100">{state.delivered}</span>
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-zinc-300">
              CEO {data.company.ceo}
            </span>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="hero-wash">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-10 px-6 pb-14 pt-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14">
          <div>
            <motion.h1
              {...enter(0)}
              className="text-5xl font-semibold tracking-tighter leading-none md:text-6xl"
            >
              Agents ship footage.
            </motion.h1>
            <motion.p {...enter(0.08)} className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-zinc-400">
              A one-person media company: three AI directors, a Claude jury, real renders, and a
              human gate on every dollar.
            </motion.p>
            <motion.div {...enter(0.16)} className="mt-7 flex items-center gap-3">
              <a
                href="#operate"
                className="btn-primary flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold"
              >
                Run a live brief <ArrowRight size={15} weight="bold" />
              </a>
              <a href="#showcase" className="btn-ghost flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-medium">
                <Play size={15} /> See shipped work
              </a>
            </motion.div>
          </div>

          {/* featured stage */}
          <motion.div {...enter(0.12)} className="relative">
            {selected && (
              <div className="mono mb-2 flex items-center justify-between text-[11.5px] text-zinc-500">
                <span className="truncate pr-3">
                  {selected.client} / {selected.title}
                </span>
                <span
                  className={
                    selected.status === 'delivered' || selected.status === 'review'
                      ? 'text-emerald-400'
                      : selected.status === 'greenlight'
                        ? 'text-emerald-300'
                        : 'pulse-soft text-amber-300'
                  }
                >
                  {STATUS_LABEL[selected.status]}
                </span>
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={(selected?.id ?? 'none') + (selected?.videoFile ?? '')}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {!selected ? (
                  <div className="card flex aspect-[9/16] items-center justify-center text-[13px] text-zinc-600">
                    No active order
                  </div>
                ) : selected.videoFile ? (
                  <video
                    src={selected.videoFile}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full rounded-2xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                  />
                ) : selected.status === 'producing' ? (
                  <div className="card flex aspect-[9/16] flex-col items-center justify-center gap-4 p-6">
                    <FilmSlate size={26} className="text-emerald-400" />
                    <div className="mono text-4xl font-semibold">{selected.videoProgress ?? 0}%</div>
                    <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                        style={{ width: `${selected.videoProgress ?? 2}%` }}
                      />
                    </div>
                    <div className="mono text-center text-[11px] leading-relaxed text-zinc-500">
                      Seedance 2.0 mini rendering
                      <br />
                      poster in parallel
                    </div>
                  </div>
                ) : selected.status === 'greenlight' ? (
                  <div className="card flex aspect-[9/16] flex-col items-center justify-center gap-4 p-7 text-center">
                    <UserCircleCheck size={28} className="text-emerald-300" />
                    <div className="text-[15px] font-medium leading-snug">
                      Three concepts ranked.
                      <br />
                      Your call funds the render.
                    </div>
                    <a href="#operate" className="btn-primary rounded-full px-4 py-2 text-[12.5px] font-semibold">
                      Review concepts
                    </a>
                  </div>
                ) : (
                  <div className="card flex aspect-[9/16] flex-col items-center justify-center gap-3 p-6">
                    <div className="shimmer h-2 w-2/3 rounded-full" />
                    <div className="shimmer h-2 w-1/2 rounded-full" />
                    <div className="mono mt-1 text-[11.5px] text-zinc-500">
                      {selected ? STATUS_LABEL[selected.status] : ''}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            {selected?.posterFile && (
              <img
                src={selected.posterFile}
                alt="Campaign key visual"
                className="absolute -left-4 bottom-4 w-[86px] rotate-[-3deg] rounded-lg border border-white/15 shadow-xl"
              />
            )}
          </motion.div>
        </div>
      </header>

      {/* showcase */}
      <section id="showcase" className="mx-auto max-w-[1400px] px-6 py-14">
        <motion.div {...inView()} className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Shipped work</h2>
            <p className="mt-1 text-[13.5px] text-zinc-500">
              Real renders, accepted by a human, settled from escrow.
            </p>
          </div>
          {shipped.length > 0 && (
            <div className="mono text-[12.5px] text-zinc-500">
              {shipped.length} deliverables / <span className="text-emerald-400">{money(state.revenue)}</span> collected
            </div>
          )}
        </motion.div>
        {shipped.length === 0 ? (
          <div className="card-quiet flex h-44 items-center justify-center text-[13px] text-zinc-600">
            Nothing shipped yet. Run a brief below.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {shipped.map((o, i) => (
              <motion.button
                key={o.id}
                {...inView(i * 0.05)}
                onClick={() => {
                  setSelectedId(o.id)
                  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
                }}
                className="hover-lift group relative overflow-hidden rounded-2xl border border-white/10 text-left"
              >
                {o.videoFile ? (
                  <video src={o.videoFile} muted loop autoPlay playsInline className="aspect-[9/16] w-full object-cover" />
                ) : (
                  <img src={o.posterFile} alt={o.title} className="aspect-[9/16] w-full object-cover" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-3 pt-10">
                  <div className="text-[12.5px] font-medium leading-tight">{o.title}</div>
                  <div className="mono mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="truncate pr-2">{o.client}</span>
                    <span className="font-semibold text-emerald-400">{money(o.amountUsd)}</span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      {/* the loop */}
      <section className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-[1400px] px-6 py-14">
          <motion.div {...inView()}>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Cents explore. Dollars render. A human gates both.
            </h2>
            <p className="mt-1 max-w-[62ch] text-[13.5px] text-zinc-500">
              The jury is the economic filter: pairwise Claude duels aggregated with Bradley-Terry,
              the same mechanism that took rank 1 in Ethereum Foundation&apos;s Deep Funding contest.
            </p>
          </motion.div>
          <motion.div {...inView(0.08)} className="mt-8 flex flex-wrap items-stretch gap-2">
            {[
              { icon: <Coins size={17} />, label: 'Brief escrowed', sub: 'client budget locked', human: false },
              { icon: <FilmSlate size={17} />, label: '3 concepts', sub: '$0.02 total', human: false },
              { icon: <Scales size={17} />, label: 'Jury duels', sub: '6 duels, $0.01', human: false },
              { icon: <UserCircleCheck size={17} />, label: 'Greenlight', sub: 'human funds the render', human: true },
              { icon: <FilmSlate size={17} />, label: 'Render + poster', sub: '$0.27, about 2 min', human: false },
              { icon: <CheckCircle size={17} />, label: 'Accept', sub: 'human releases escrow, USDC settles', human: true },
            ].map((s, i, arr) => (
              <div key={s.label} className="flex items-center gap-2">
                <div
                  className={
                    'flex min-w-[150px] flex-col gap-1 rounded-2xl border px-4 py-3 ' +
                    (s.human ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/8 bg-white/[0.02]')
                  }
                >
                  <div className={'flex items-center gap-2 text-[13px] font-medium ' + (s.human ? 'text-emerald-300' : 'text-zinc-200')}>
                    {s.icon} {s.label}
                  </div>
                  <div className="mono text-[11px] text-zinc-500">{s.sub}</div>
                </div>
                {i < arr.length - 1 && <ArrowRight size={14} className="shrink-0 text-zinc-700" />}
              </div>
            ))}
          </motion.div>
          <motion.div {...inView(0.14)} className="mono mt-8 flex flex-wrap gap-10 text-[13px]">
            <div>
              <div className="text-zinc-500">avg order</div>
              <div className="mt-0.5 text-2xl font-semibold text-zinc-100">
                {shipped.length ? money(state.revenue / shipped.length) : '--'}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">avg cogs</div>
              <div className="mt-0.5 text-2xl font-semibold text-zinc-100">
                {shipped.length ? '$' + (cogsDelivered / shipped.length).toFixed(2) : '--'}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">gross margin</div>
              <div className="mt-0.5 text-2xl font-semibold text-emerald-400">
                {grossMargin ? `${grossMargin}%` : '--'}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">turnaround</div>
              <div className="mt-0.5 text-2xl font-semibold text-zinc-100">same hour</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* team */}
      <section className="mx-auto max-w-[1400px] px-6 py-14">
        <motion.div {...inView()}>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Three directors and a jury</h2>
          <p className="mt-1 text-[13.5px] text-zinc-500">
            Distinct creative crafts compete on every brief. Reputation accrues per shipped order.
          </p>
        </motion.div>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {agents.map((a, i) => (
            <motion.div key={a.id} {...inView(i * 0.06)} className="hover-lift overflow-hidden rounded-2xl border border-white/10">
              <img src={PORTRAIT[a.id]} alt={`${a.name}, ${a.role}`} className="aspect-square w-full object-cover" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-semibold">{a.name}</div>
                  <span
                    className={
                      'h-2 w-2 rounded-full ' + (a.status === 'working' ? 'pulse-soft bg-amber-400' : 'bg-emerald-400/80')
                    }
                  />
                </div>
                <div className="text-[12.5px] text-zinc-400">{a.role}</div>
                <div className="mono mt-2 text-[11.5px] text-zinc-500">
                  rep {a.reputation} / {a.delivered} shipped / ${a.feeUsd} per concept
                </div>
              </div>
            </motion.div>
          ))}
          <motion.div {...inView(0.2)} className="flex flex-col justify-between rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-4">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-emerald-300">
                <Scales size={17} /> The Jury
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">
                Judge BRAND scores client fit. Judge SCROLL scores stopping power. Every pair of
                concepts duels, Bradley-Terry aggregates the verdicts.
              </p>
            </div>
            <div className="mono mt-3 text-[11.5px] text-zinc-500">
              claude-sonnet-5 on the founder&apos;s own relay
            </div>
          </motion.div>
        </div>
      </section>

      {/* operate */}
      <section id="operate" className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-[1400px] px-6 py-14">
          <motion.div {...inView()}>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Run the studio</h2>
            <p className="mt-1 text-[13.5px] text-zinc-500">
              Lock a brief into escrow, then make the two calls only a human makes here.
            </p>
          </motion.div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
            {/* left: selected order operations */}
            <div className="card p-5">
              {!selected ? (
                <div className="flex h-40 items-center justify-center text-[13px] text-zinc-600">
                  Select an order to operate
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mono text-[11.5px] text-zinc-500">
                        {selected.client} / {selected.vertical} / <span className="text-zinc-300">{money(selected.amountUsd)} in escrow</span>
                        {selected.revision > 0 && <span className="text-amber-400"> / rev {selected.revision}</span>}
                      </div>
                      <div className="mt-1 text-[17px] font-semibold tracking-tight">{selected.title}</div>
                    </div>
                    <span
                      className={
                        'mono shrink-0 rounded-full border px-3 py-1 text-[11px] ' +
                        (selected.status === 'greenlight' || selected.status === 'review'
                          ? 'border-emerald-400/40 text-emerald-300'
                          : selected.status === 'delivered'
                            ? 'border-white/10 text-zinc-300'
                            : 'border-amber-400/30 text-amber-300')
                      }
                    >
                      {STATUS_LABEL[selected.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500">{selected.brief}</p>

                  {/* greenlight picker */}
                  {selected.status === 'greenlight' && (
                    <div className="mt-4 space-y-2.5">
                      {selected.ranking.map((r, idx) => {
                        const d = selected.drafts.find((x) => x.agentId === r.agentId)!
                        const a = agentOf(r.agentId)!
                        return (
                          <div
                            key={r.agentId}
                            className={
                              'rounded-2xl border p-4 ' +
                              (idx === 0 ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/8 bg-white/[0.02]')
                            }
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mono text-[11px] text-zinc-500">
                                  {a.name} / jury strength {(r.score * 100).toFixed(0)}% / {r.wins} duel wins
                                </div>
                                <div className="mt-0.5 text-[15px] font-semibold">{d.concept.concept}</div>
                                <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400">{d.concept.hook}</p>
                              </div>
                              <button
                                onClick={() => post('/api/greenlight', { orderId: selected.id, agentId: r.agentId })}
                                className={
                                  'shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold ' +
                                  (idx === 0 ? 'btn-primary' : 'btn-ghost')
                                }
                              >
                                {idx === 0 ? 'Greenlight' : 'Fund this'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      <p className="mono pt-1 text-[11px] text-zinc-600">
                        Concepts cost $0.03 so far. The render you fund costs about $0.27.
                      </p>
                    </div>
                  )}

                  {/* review actions */}
                  {selected.status === 'review' && (
                    <div className="mt-4">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                        <div className="mono text-[11px] text-zinc-500">
                          winning concept by {agentOf(selected.winnerAgentId)?.name}
                        </div>
                        <div className="mt-0.5 text-[15px] font-semibold">{winnerDraft?.concept.concept}</div>
                        <div className="mono mt-2 flex gap-6 text-[12px] text-zinc-400">
                          <span>price <span className="text-zinc-100">{money(selected.amountUsd)}</span></span>
                          <span>cogs <span className="text-zinc-100">${selected.cogsUsd.toFixed(2)}</span></span>
                          <span>
                            margin{' '}
                            <span className="text-emerald-400">
                              {(((selected.amountUsd - selected.cogsUsd) / selected.amountUsd) * 100).toFixed(1)}%
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => post('/api/review', { orderId: selected.id, action: 'approve' })}
                          className="btn-primary flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold"
                        >
                          <CheckCircle size={16} weight="bold" /> Accept and settle
                        </button>
                        <input
                          aria-label="CEO revision notes"
                          placeholder="Notes: hook harder, warmer light, tighter ending"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-[12.5px] outline-none placeholder:text-zinc-600 focus:border-emerald-400/50"
                        />
                        <button
                          onClick={() => {
                            post('/api/review', { orderId: selected.id, action: 'revise', feedback: feedbackText })
                            setFeedbackText('')
                          }}
                          className="btn-ghost flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[12.5px] font-medium"
                        >
                          <ArrowUUpLeft size={14} /> Send back
                        </button>
                      </div>
                    </div>
                  )}

                  {/* delivered invoice */}
                  {selected.status === 'delivered' && selected.invoice && (
                    <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                      <div className="flex items-center justify-between">
                        <div className="mono text-[12.5px] font-medium text-zinc-200">{selected.invoice.id}</div>
                        <div className="mono text-[13px] font-semibold text-emerald-400">
                          {money(selected.amountUsd)} settled
                        </div>
                      </div>
                      <div className="mono mt-1.5 break-all text-[11px] text-zinc-600">
                        {selected.invoice.ref.includes('https://') ? (
                          <>
                            {selected.invoice.ref.split('https://')[0]}
                            <a
                              href={'https://' + selected.invoice.ref.split('https://')[1]}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 underline decoration-emerald-400/40 hover:text-emerald-300"
                            >
                              View on BaseScan
                            </a>
                          </>
                        ) : (
                          selected.invoice.ref
                        )}
                      </div>
                    </div>
                  )}

                  {/* jury detail */}
                  {selected.duels.length > 0 && selected.status !== 'greenlight' && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-[12px] text-zinc-500 hover:text-zinc-300">
                        Jury detail: {selected.duels.length} duels, Bradley-Terry aggregate
                      </summary>
                      <div className="mt-2 space-y-1.5 rounded-2xl border border-white/6 bg-white/[0.015] p-3.5">
                        {selected.duels.map((d, i) => (
                          <div key={i} className="text-[11.5px] leading-relaxed text-zinc-500">
                            <span className="text-zinc-400">
                              {agentOf(d.a)?.name} vs {agentOf(d.b)?.name}
                            </span>{' '}
                            / {d.judge} picked <span className="text-zinc-200">{agentOf(d.winner)?.name}</span>: {d.reason}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>

            {/* right: intake + active */}
            <div className="flex flex-col gap-4">
              <div className="card p-5">
                <div className="text-[14px] font-semibold">New brief</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {templates.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => post('/api/orders', { template: i })}
                      className="btn-ghost rounded-full px-3.5 py-2 text-[12px]"
                    >
                      {t.client} <span className="mono text-zinc-500">{money(t.amountUsd)}</span>
                    </button>
                  ))}
                  <button onClick={() => setShowCustom((v) => !v)} className="btn-ghost rounded-full px-3.5 py-2 text-[12px]">
                    + custom
                  </button>
                  <button
                    onClick={() => {
                      setPlaybookDraft(state.playbook)
                      setShowPlaybook((v) => !v)
                    }}
                    className="btn-ghost rounded-full px-3.5 py-2 text-[12px]"
                  >
                    Playbook
                  </button>
                </div>

                {showCustom && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="col-span-1">
                      <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-client">Client</label>
                      <input
                        id="c-client"
                        value={custom.client}
                        onChange={(e) => setCustom({ ...custom, client: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] outline-none focus:border-emerald-400/50"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-vert">Vertical</label>
                      <select
                        id="c-vert"
                        value={custom.vertical}
                        onChange={(e) => setCustom({ ...custom, vertical: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-[#131316] px-3 py-2 text-[12.5px] text-zinc-200 outline-none focus:border-emerald-400/50"
                      >
                        <option>product ad</option>
                        <option>travel promo</option>
                        <option>science explainer</option>
                        <option>brand film</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-title">Order title</label>
                      <input
                        id="c-title"
                        value={custom.title}
                        onChange={(e) => setCustom({ ...custom, title: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] outline-none focus:border-emerald-400/50"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-brief">
                        Brief: audience, feel, what to end on
                      </label>
                      <textarea
                        id="c-brief"
                        rows={3}
                        value={custom.brief}
                        onChange={(e) => setCustom({ ...custom, brief: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-emerald-400/50"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-usd">Budget (USD)</label>
                      <input
                        id="c-usd"
                        type="number"
                        value={custom.amountUsd}
                        onChange={(e) => setCustom({ ...custom, amountUsd: Number(e.target.value) })}
                        className="mono w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] outline-none focus:border-emerald-400/50"
                      />
                    </div>
                    <div className="col-span-1 flex items-end">
                      <button
                        onClick={() => {
                          post('/api/orders', custom)
                          setShowCustom(false)
                        }}
                        className="btn-primary w-full rounded-full px-4 py-2 text-[12.5px] font-semibold"
                      >
                        Lock escrow
                      </button>
                    </div>
                  </div>
                )}

                {showPlaybook && (
                  <div className="mt-4">
                    <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="pb">
                      CEO Playbook, injected into every agent prompt
                    </label>
                    <textarea
                      id="pb"
                      value={playbookDraft ?? state.playbook}
                      onChange={(e) => setPlaybookDraft(e.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-[12px] leading-relaxed outline-none focus:border-emerald-400/50"
                    />
                    <button
                      onClick={() => {
                        post('/api/playbook', { playbook: playbookDraft })
                        setShowPlaybook(false)
                      }}
                      className="btn-primary mt-2 rounded-full px-4 py-2 text-[12.5px] font-semibold"
                    >
                      Save playbook
                    </button>
                  </div>
                )}
              </div>

              {active.length > 0 && (
                <div className="card p-5">
                  <div className="text-[14px] font-semibold">In the pipeline</div>
                  <div className="mt-3 space-y-2">
                    {active.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setSelectedId(o.id)}
                        className={
                          'w-full rounded-xl border p-3 text-left transition-colors ' +
                          (selectedId === o.id
                            ? 'border-emerald-400/40 bg-emerald-400/5'
                            : 'border-white/8 bg-white/[0.02] hover:border-white/20')
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12.5px] font-medium">{o.title}</span>
                          <span
                            className={
                              'mono shrink-0 text-[11px] ' +
                              (o.status === 'greenlight' || o.status === 'review'
                                ? 'text-emerald-300'
                                : 'pulse-soft text-amber-300')
                            }
                          >
                            {STATUS_LABEL[o.status]}
                          </span>
                        </div>
                        <div className="mono mt-1 text-[11px] text-zinc-500">
                          {o.client} / {money(o.amountUsd)}
                        </div>
                        {o.status === 'producing' && (
                          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${o.videoProgress ?? 2}%` }}
                            />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ledger */}
      <section className="mx-auto max-w-[1400px] px-6 py-14">
        <motion.div {...inView()}>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">The ledger</h2>
          <p className="mt-1 text-[13.5px] text-zinc-500">
            Every event the company emits, and every invoice it settles.
          </p>
        </motion.div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
          <div className="card flex h-[300px] flex-col p-4">
            <div className="mono min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-[12px] leading-relaxed">
              {state.events.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 text-zinc-600">{fmtTime(e.t)}</span>
                  <span className={'shrink-0 font-medium ' + (TAG_STYLE[e.tag] ?? 'text-zinc-400')}>{e.tag}</span>
                  <span className={i === 0 ? 'text-zinc-200' : 'text-zinc-500'}>{e.text}</span>
                </div>
              ))}
              {state.events.length === 0 && <div className="text-zinc-600">Quiet. Lock a brief to wake the studio.</div>}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-[14px] font-semibold">Invoices</div>
            <div className="mt-3 space-y-2.5">
              {shipped.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mono truncate text-[12px] text-zinc-300">
                      {o.invoice?.id} / {o.client}
                    </div>
                    <div className="mono text-[11px] text-zinc-600">
                      margin {(((o.amountUsd - o.cogsUsd) / o.amountUsd) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="mono shrink-0 text-[12.5px] font-semibold text-emerald-400">{money(o.amountUsd)}</div>
                </div>
              ))}
              {shipped.length === 0 && <div className="text-[12.5px] text-zinc-600">No invoices yet.</div>}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-2 px-6 py-6 text-[11.5px] text-zinc-600 md:flex-row md:items-center">
          <span>
            OPC formula, implemented: Human Experience is the Playbook, the AI Loop is concepts
            plus jury plus render, Human Review gates the spend and releases escrow.
          </span>
          <span className="mono">BUIDL_OPC_Hackathon_SG / 2026-07-12</span>
        </div>
      </footer>
    </div>
  )
}
