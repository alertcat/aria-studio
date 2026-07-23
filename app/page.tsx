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
  GLGHT: 'text-zinc-100',
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

const READONLY = process.env.NEXT_PUBLIC_READONLY === '1'
const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_URL || ''
const STUDIO_HREF = READONLY ? (LIVE_URL ? LIVE_URL + '/studio' : '') : '/studio'

const MARQUEE_ITEMS = [
  'Product ads',
  'Travel promos',
  'Science explainers',
  'Real renders',
  'Jury ranked',
  'Human gated',
  'USDC settled',
]

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
      const res = await fetch(READONLY ? '/demo-state.json' : '/api/state', { cache: 'no-store' })
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
    if (READONLY) return
    const id = setInterval(poll, 1200)
    return () => clearInterval(id)
  }, [poll])

  const post = async (url: string, body?: unknown) => {
    if (READONLY) return
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
  const gallery = shipped.filter((o) => o.videoFile || o.posterFile)
  const active = orders.filter((o) => o.status !== 'delivered')
  const cogsDelivered = shipped.reduce((s, o) => s + o.cogsUsd, 0)
  const grossMargin =
    state.revenue > 0 ? (((state.revenue - cogsDelivered) / state.revenue) * 100).toFixed(1) : null
  const winnerDraft = selected?.drafts.find((d) => d.agentId === selected.winnerAgentId)

  const enter = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        }
  const inView = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.2 },
          transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const },
        }

  const stageCard = !selected ? (
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
      className="w-full rounded-2xl border border-white/15"
    />
  ) : selected.status === 'producing' ? (
    <div className="card flex aspect-[9/16] flex-col items-center justify-center gap-4 bg-[#0b0b0d]/80 p-6 backdrop-blur-sm">
      <FilmSlate size={26} className="text-zinc-100" />
      <div className="mono text-4xl font-semibold">{selected.videoProgress ?? 0}%</div>
      <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-zinc-100 transition-all duration-700"
          style={{ width: `${selected.videoProgress ?? 2}%` }}
        />
      </div>
      <div className="mono text-center text-[11px] leading-relaxed text-zinc-400">
        Seedance 2.0 mini rendering
        <br />
        poster in parallel
      </div>
    </div>
  ) : selected.status === 'greenlight' ? (
    <div className="card flex aspect-[9/16] flex-col items-center justify-center gap-4 bg-[#0b0b0d]/80 p-7 text-center backdrop-blur-sm">
      <UserCircleCheck size={28} className="text-zinc-100" />
      <div className="display text-[17px] font-semibold leading-snug">
        Three concepts ranked.
        <br />
        Your call funds the render.
      </div>
      <a href="#operate" className="btn-primary rounded-full px-4 py-2 text-[12.5px] font-semibold">
        Review concepts
      </a>
    </div>
  ) : (
    <div className="card flex aspect-[9/16] flex-col items-center justify-center gap-3 bg-[#0b0b0d]/80 p-6 backdrop-blur-sm">
      <div className="shimmer h-2 w-2/3 rounded-full" />
      <div className="shimmer h-2 w-1/2 rounded-full" />
      <div className="mono mt-1 text-[11.5px] text-zinc-400">
        {selected ? STATUS_LABEL[selected.status] : ''}
      </div>
    </div>
  )

  return (
    <div className="min-h-[100dvh]">
      {/* nav */}
      <nav className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-[#09090b]/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6">
          <div className="flex items-baseline gap-2.5">
            <span className="display text-[18px] font-semibold tracking-tight">Aria Studio</span>
            <span className="mono hidden text-[11px] text-zinc-500 sm:inline">a solo performance</span>
          </div>
          <div className="mono flex items-center gap-5 text-[13px]">
            <span className="text-zinc-400">
              revenue{' '}
              <span className="font-medium text-emerald-400">
                <AnimatedMoney value={state.revenue} />
              </span>
            </span>
            <span className="hidden text-zinc-400 sm:inline">
              margin <span className="font-medium text-zinc-100">{grossMargin ? `${grossMargin}%` : '--'}</span>
            </span>
            {STUDIO_HREF && (
              <a href={STUDIO_HREF} className="btn-primary rounded-full px-3.5 py-1.5 text-[12px] font-semibold">
                Open studio
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* hero: full-bleed cinematic */}
      <header className="hero-wash relative flex min-h-[96dvh] items-end overflow-hidden">
        <motion.img
          src="/media/bg-hero.png"
          alt=""
          initial={reduce ? false : { scale: 1.06, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="scrim-hero absolute inset-0" />
        <div className="relative mx-auto grid w-full max-w-[1440px] grid-cols-1 items-end gap-10 px-6 pb-16 pt-32 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <motion.h1
              {...enter(0.1)}
              className="display max-w-[10ch] text-7xl font-semibold leading-[0.94] md:text-8xl xl:text-[7.25rem]"
            >
              Agents ship footage.
            </motion.h1>
            <motion.p {...enter(0.22)} className="mt-6 max-w-[44ch] text-[16px] leading-relaxed text-zinc-300">
              A one-person media company: three AI directors, a Claude jury, real renders, and a
              human gate on every dollar.
            </motion.p>
            <motion.div {...enter(0.32)} className="mt-8 flex items-center gap-3">
              <a
                href={STUDIO_HREF || '#operate'}
                className="btn-primary flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-semibold"
              >
                Run a live brief <ArrowRight size={15} weight="bold" />
              </a>
              <a
                href="#showcase"
                className="btn-ghost flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium backdrop-blur-sm"
              >
                <Play size={15} /> See shipped work
              </a>
            </motion.div>
          </div>

          {/* floating featured stage */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 30, rotate: 0 }}
            animate={{ opacity: 1, y: 0, rotate: 1.2 }}
            transition={{ duration: 0.8, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative hidden shadow-[0_40px_120px_rgba(0,0,0,0.7)] lg:block"
          >
            {selected && (
              <div className="mono mb-2 flex items-center justify-between text-[11px] text-zinc-400">
                <span className="truncate pr-3">
                  {selected.client} / {money(selected.amountUsd)}
                </span>
                <span
                  className={
                    selected.status === 'delivered' || selected.status === 'review'
                      ? 'text-zinc-100'
                      : selected.status === 'greenlight'
                        ? 'text-zinc-200'
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
                {stageCard}
              </motion.div>
            </AnimatePresence>
            {selected?.posterFile && (
              <img
                src={selected.posterFile}
                alt="Campaign key visual"
                className="absolute -left-6 bottom-5 w-[84px] -rotate-6 rounded-lg border border-white/20 shadow-2xl"
              />
            )}
          </motion.div>
        </div>
      </header>

      {/* marquee */}
      <div className="overflow-hidden border-y border-white/5 bg-white/[0.015] py-3.5">
        <div className="marquee-track">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0 items-center">
              {MARQUEE_ITEMS.map((it) => (
                <span key={it + dup} className="display flex items-center text-[17px] font-medium text-zinc-500">
                  <span className="px-6">{it}</span>
                  <span className="text-white/30">/</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* showcase: gallery wall */}
      <section id="showcase" className="mx-auto max-w-[1440px] px-6 py-24">
        <motion.div {...inView()} className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="display text-4xl font-semibold tracking-tight md:text-5xl">Shipped work</h2>
            <p className="mt-2 text-[14px] text-zinc-500">
              Real renders, accepted by a human, settled from escrow.
            </p>
          </div>
          {gallery.length > 0 && (
            <div className="mono hidden text-[12.5px] text-zinc-500 md:block">
              {gallery.length} deliverables / <span className="text-emerald-400">{money(state.revenue)}</span> collected
            </div>
          )}
        </motion.div>
        {gallery.length === 0 ? (
          <div className="card-quiet flex h-44 items-center justify-center text-[13px] text-zinc-600">
            Nothing shipped yet. Run a brief below.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
            {gallery.map((o, i) => (
              <motion.button
                key={o.id}
                {...inView(i * 0.06)}
                whileTap={reduce ? undefined : { scale: 0.98 }}
                onClick={() => {
                  setSelectedId(o.id)
                  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
                }}
                className="group tap text-left"
              >
                <div className="hover-lift relative overflow-hidden rounded-xl border border-white/10">
                  {o.videoFile ? (
                    <video
                      src={o.videoFile}
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="aspect-[9/16] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <img src={o.posterFile} alt={o.title} className="aspect-[9/16] w-full object-cover" />
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="display truncate text-[15px] font-medium leading-tight">{o.title}</div>
                    <div className="mt-0.5 text-[12px] text-zinc-500">
                      {o.client} / {o.vertical}
                    </div>
                  </div>
                  <div className="mono shrink-0 text-[13px] font-semibold text-zinc-100">
                    {money(o.amountUsd)}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      {/* the loop: editorial steps over set imagery */}
      <section className="relative overflow-hidden border-y border-white/5">
        <img src="/media/bg-loop.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="scrim-panel absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 gap-14 px-6 py-24 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <motion.div {...inView()}>
              <h2 className="display max-w-[16ch] text-4xl font-semibold tracking-tight md:text-5xl">
                Cents explore. Dollars render. A human gates both.
              </h2>
              <p className="mt-3 max-w-[58ch] text-[14px] leading-relaxed text-zinc-400">
                The jury is the economic filter: pairwise Claude duels aggregated with
                Bradley-Terry, the same mechanism that took rank 1 in Ethereum Foundation&apos;s
                Deep Funding contest.
              </p>
            </motion.div>
            <div className="mt-10 space-y-1">
              {[
                { n: '01', label: 'Brief escrowed', sub: 'client budget locked on-chain', human: false },
                { n: '02', label: 'Three concepts', sub: '$0.02 total, gpt-5.4-mini', human: false },
                { n: '03', label: 'Jury duels', sub: '6 duels, $0.01, claude-sonnet-5', human: false },
                { n: '04', label: 'Greenlight', sub: 'the human funds the render', human: true },
                { n: '05', label: 'Render and poster', sub: '$0.27, about two minutes', human: false },
                { n: '06', label: 'Accept', sub: 'the human releases escrow, USDC settles', human: true },
              ].map((s, i) => (
                <motion.div
                  key={s.n}
                  {...inView(i * 0.05)}
                  className={
                    'flex items-baseline gap-5 border-b py-4 ' +
                    (s.human ? 'border-white/20' : 'border-white/8')
                  }
                >
                  <span
                    className={
                      'display text-3xl font-semibold md:text-4xl ' +
                      (s.human ? 'text-white/45' : 'text-white/15')
                    }
                  >
                    {s.n}
                  </span>
                  <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-6">
                    <span className={'display text-xl font-medium md:text-2xl ' + (s.human ? 'text-white' : 'text-zinc-100')}>
                      {s.label}
                    </span>
                    <span className="mono text-[12px] text-zinc-500">{s.sub}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <motion.div {...inView(0.15)} className="flex flex-col justify-end gap-8">
            <div className="mono space-y-6 text-[13px]">
              <div>
                <div className="text-zinc-500">avg order</div>
                <div className="display mt-1 text-4xl font-semibold text-zinc-100">
                  {shipped.length ? money(state.revenue / shipped.length) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">avg cogs</div>
                <div className="display mt-1 text-4xl font-semibold text-zinc-100">
                  {shipped.length ? '$' + (cogsDelivered / shipped.length).toFixed(2) : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">gross margin</div>
                <div className="display mt-1 text-4xl font-semibold text-emerald-400">
                  {grossMargin ? `${grossMargin}%` : '--'}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">turnaround</div>
                <div className="display mt-1 text-4xl font-semibold text-zinc-100">same hour</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* team */}
      <section className="mx-auto max-w-[1440px] px-6 py-24">
        <motion.div {...inView()}>
          <h2 className="display text-4xl font-semibold tracking-tight md:text-5xl">
            Three directors and a jury
          </h2>
          <p className="mt-2 text-[14px] text-zinc-500">
            Distinct creative crafts compete on every brief. Reputation accrues per shipped order.
          </p>
        </motion.div>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {agents.map((a, i) => (
            <motion.div key={a.id} {...inView(i * 0.07)} className="group">
              <div className="hover-lift overflow-hidden rounded-2xl border border-white/10">
                <img
                  src={PORTRAIT[a.id]}
                  alt={`${a.name}, ${a.role}`}
                  className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <span className="display text-[17px] font-semibold">{a.name}</span>
                  <span className="ml-2 text-[12.5px] text-zinc-500">{a.role}</span>
                </div>
                <span
                  className={
                    'h-2 w-2 rounded-full ' + (a.status === 'working' ? 'pulse-soft bg-amber-400' : 'bg-white/60')
                  }
                />
              </div>
              <div className="mono mt-1 text-[11.5px] text-zinc-500">
                rep {a.reputation} / {a.delivered} shipped / ${a.feeUsd} per concept
              </div>
            </motion.div>
          ))}
          <motion.div
            {...inView(0.22)}
            className="flex flex-col justify-between rounded-2xl border border-white/15 bg-white/[0.03] p-5"
          >
            <div>
              <div className="display flex items-center gap-2 text-[19px] font-semibold text-zinc-100">
                <Scales size={19} /> The Jury
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
                Judge BRAND scores client fit. Judge SCROLL scores stopping power. Every pair of
                concepts duels, Bradley-Terry aggregates the verdicts.
              </p>
            </div>
            <div className="mono mt-4 text-[11.5px] text-zinc-500">
              claude-sonnet-5, in-house relay
            </div>
          </motion.div>
        </div>
      </section>

      {/* field notes */}
      <section className="mx-auto max-w-[1440px] px-6 py-24">
        <motion.div {...inView()}>
          <h2 className="display text-4xl font-semibold tracking-tight md:text-5xl">Field notes</h2>
          <p className="mt-2 text-[14px] text-zinc-500">
            How a one-person studio actually runs: the mechanism, the money, the machines.
          </p>
        </motion.div>
        <div className="mt-10 grid grid-cols-1 gap-x-4 gap-y-10 md:grid-cols-3">
          {[
            {
              img: '/media/journal-jury.png',
              title: 'Why juries beat scores',
              sub: 'Pairwise duels and Bradley-Terry, the mechanism that won an Ethereum Foundation contest, now running creative QA.',
            },
            {
              img: '/media/journal-gate.png',
              title: 'Two gates, where money moves',
              sub: 'Greenlight funds the render. Acceptance releases escrow. Human judgment sits exactly on the spend.',
            },
            {
              img: '/media/journal-infra.png',
              title: 'Rendering at wholesale',
              sub: 'The studio runs on in-house render infrastructure, so the margin funds taste, not compute.',
            },
          ].map((j, i) => (
            <motion.div key={j.title} {...inView(i * 0.07)} className="group">
              <div className="hover-lift overflow-hidden rounded-2xl border border-white/10">
                <img
                  src={j.img}
                  alt={j.title}
                  className="aspect-[3/2] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="display mt-3 text-[18px] font-semibold leading-snug">{j.title}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">{j.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* operate */}
      <section id="operate" className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-[1440px] px-6 py-24">
          <motion.div {...inView()}>
            <h2 className="display text-4xl font-semibold tracking-tight md:text-5xl">Run the studio</h2>
            <p className="mt-2 text-[14px] text-zinc-500">
              {READONLY && STUDIO_HREF ? (
                <>
                  The pipeline is running live right now.{' '}
                  <a
                    href={STUDIO_HREF}
                    className="font-medium text-zinc-100 underline decoration-white/35 hover:text-white"
                  >
                    Open the control room
                  </a>{' '}
                  and make the two calls yourself: greenlight a render, release an escrow.
                </>
              ) : (
                'Lock a brief into escrow, then make the two calls only a human makes here.'
              )}
            </p>
          </motion.div>

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
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
                        {selected.client} / {selected.vertical} /{' '}
                        <span className="text-zinc-300">{money(selected.amountUsd)} in escrow</span>
                        {selected.revision > 0 && <span className="text-amber-400"> / rev {selected.revision}</span>}
                      </div>
                      <div className="display mt-1 text-[19px] font-semibold tracking-tight">{selected.title}</div>
                    </div>
                    <span
                      className={
                        'mono shrink-0 rounded-full border px-3 py-1 text-[11px] ' +
                        (selected.status === 'greenlight' || selected.status === 'review'
                          ? 'border-white/30 text-zinc-100'
                          : selected.status === 'delivered'
                            ? 'border-white/10 text-zinc-300'
                            : 'border-amber-400/30 text-amber-300')
                      }
                    >
                      {STATUS_LABEL[selected.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-500">{selected.brief}</p>

                  {/* mobile stage */}
                  <div className="mt-4 lg:hidden">{stageCard}</div>

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
                              (idx === 0 ? 'border-white/25 bg-white/[0.04]' : 'border-white/8 bg-white/[0.02]')
                            }
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="mono text-[11px] text-zinc-500">
                                  {a.name} / jury strength {(r.score * 100).toFixed(0)}% / {r.wins} duel wins
                                </div>
                                <div className="display mt-0.5 text-[16px] font-semibold">{d.concept.concept}</div>
                                <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400">{d.concept.hook}</p>
                              </div>
                              {!READONLY && (
                                <button
                                  onClick={() => post('/api/greenlight', { orderId: selected.id, agentId: r.agentId })}
                                  className={
                                    'shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold ' +
                                    (idx === 0 ? 'btn-primary' : 'btn-ghost')
                                  }
                                >
                                  {idx === 0 ? 'Greenlight' : 'Fund this'}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <p className="mono pt-1 text-[11px] text-zinc-600">
                        Concepts cost $0.03 so far. The render you fund costs about $0.27.
                      </p>
                      {READONLY && STUDIO_HREF && (
                        <a
                          href={STUDIO_HREF}
                          className="btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold"
                        >
                          Greenlight it yourself in the control room <ArrowRight size={14} weight="bold" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* review actions */}
                  {selected.status === 'review' && (
                    <div className="mt-4">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                        <div className="mono text-[11px] text-zinc-500">
                          winning concept by {agentOf(selected.winnerAgentId)?.name}
                        </div>
                        <div className="display mt-0.5 text-[16px] font-semibold">{winnerDraft?.concept.concept}</div>
                        <div className="mono mt-2 flex gap-6 text-[12px] text-zinc-400">
                          <span>
                            price <span className="text-zinc-100">{money(selected.amountUsd)}</span>
                          </span>
                          <span>
                            cogs <span className="text-zinc-100">${selected.cogsUsd.toFixed(2)}</span>
                          </span>
                          <span>
                            margin{' '}
                            <span className="text-zinc-100">
                              {(((selected.amountUsd - selected.cogsUsd) / selected.amountUsd) * 100).toFixed(1)}%
                            </span>
                          </span>
                        </div>
                      </div>
                      {!READONLY && (
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
                            className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-[12.5px] outline-none placeholder:text-zinc-600 focus:border-white/30"
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
                      )}
                      {READONLY && STUDIO_HREF && (
                        <a
                          href={STUDIO_HREF}
                          className="btn-primary mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold"
                        >
                          Make this call in the control room <ArrowRight size={14} weight="bold" />
                        </a>
                      )}
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
                              className="text-zinc-100 underline decoration-white/40 hover:text-white"
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
              {READONLY ? (
                <div className="card border-white/15 bg-white/[0.03] p-5">
                  <div className="display text-[16px] font-semibold text-zinc-100">
                    The studio is live. Try it yourself.
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">
                    This page is the showcase reel. The real pipeline is running right now on the
                    studio server: fire a brief, watch three directors pitch, see the Claude jury
                    duel, greenlight the render with your own click, and release the escrow at the
                    gate. A brief is already waiting at Greenlight for you.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STUDIO_HREF && (
                      <a
                        href={STUDIO_HREF}
                        className="btn-primary inline-block rounded-full px-4 py-2 text-[12px] font-semibold"
                      >
                        Open the live control room
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card p-5">
                  <div className="display text-[16px] font-semibold">New brief</div>
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
                        <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-client">
                          Client
                        </label>
                        <input
                          id="c-client"
                          value={custom.client}
                          onChange={(e) => setCustom({ ...custom, client: e.target.value })}
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] outline-none focus:border-white/30"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-vert">
                          Vertical
                        </label>
                        <select
                          id="c-vert"
                          value={custom.vertical}
                          onChange={(e) => setCustom({ ...custom, vertical: e.target.value })}
                          className="w-full rounded-lg border border-white/10 bg-[#131316] px-3 py-2 text-[12.5px] text-zinc-200 outline-none focus:border-white/30"
                        >
                          <option>product ad</option>
                          <option>travel promo</option>
                          <option>science explainer</option>
                          <option>brand film</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-title">
                          Order title
                        </label>
                        <input
                          id="c-title"
                          value={custom.title}
                          onChange={(e) => setCustom({ ...custom, title: e.target.value })}
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] outline-none focus:border-white/30"
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
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-white/30"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="mb-1 block text-[11.5px] text-zinc-400" htmlFor="c-usd">
                          Budget (USD)
                        </label>
                        <input
                          id="c-usd"
                          type="number"
                          value={custom.amountUsd}
                          onChange={(e) => setCustom({ ...custom, amountUsd: Number(e.target.value) })}
                          className="mono w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12.5px] outline-none focus:border-white/30"
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
                        className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-[12px] leading-relaxed outline-none focus:border-white/30"
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
              )}

              {active.length > 0 && (
                <div className="card p-5">
                  <div className="display text-[16px] font-semibold">In the pipeline</div>
                  <div className="mt-3 space-y-2">
                    {active.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setSelectedId(o.id)}
                        className={
                          'tap w-full rounded-xl border p-3 text-left transition-colors ' +
                          (selectedId === o.id
                            ? 'border-white/25 bg-white/[0.04]'
                            : 'border-white/8 bg-white/[0.02] hover:border-white/20')
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12.5px] font-medium">{o.title}</span>
                          <span
                            className={
                              'mono shrink-0 text-[11px] ' +
                              (o.status === 'greenlight' || o.status === 'review'
                                ? 'text-zinc-100'
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
                              className="h-full rounded-full bg-zinc-100 transition-all"
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
      <section className="mx-auto max-w-[1440px] px-6 py-24">
        <motion.div {...inView()}>
          <h2 className="display text-4xl font-semibold tracking-tight md:text-5xl">The ledger</h2>
          <p className="mt-2 text-[14px] text-zinc-500">
            Every event the company emits, and every invoice it settles.
          </p>
        </motion.div>
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
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
            <div className="display text-[16px] font-semibold">Invoices</div>
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
                  <div className="mono shrink-0 text-[12.5px] font-semibold text-zinc-100">{money(o.amountUsd)}</div>
                </div>
              ))}
              {shipped.length === 0 && <div className="text-[12.5px] text-zinc-600">No invoices yet.</div>}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto max-w-[1440px] px-6 py-10">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="display text-[15px] font-semibold">Aria Studio</div>
              <div className="mt-1 text-[11.5px] text-zinc-600">
                An independent one-person media production company.
              </div>
            </div>
            <div className="mono flex flex-col gap-1 text-[11.5px] text-zinc-500 md:items-end">
              <a href="mailto:aria@relaydance.com" className="hover:text-zinc-200">
                aria@relaydance.com
              </a>
              <span>
                <a href="https://relaydance.com" target="_blank" rel="noreferrer" className="hover:text-zinc-200">
                  relaydance.com
                </a>
              </span>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-start justify-between gap-2 border-t border-white/5 pt-4 text-[11px] text-zinc-700 md:flex-row md:items-center">
            <span>
              OPC formula, implemented: Human Experience is the Playbook, the AI Loop is concepts
              plus jury plus render, Human Review gates the spend and releases escrow.
            </span>
            <span className="mono">Born at BUIDL_OPC_Hackathon_SG, Singapore / 2026 Aria Studio</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
