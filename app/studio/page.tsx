'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  CheckCircle,
  ArrowUUpLeft,
  ArrowLeft,
  FilmSlate,
  CircleNotch,
  Lightning,
} from '@phosphor-icons/react'

// Control Room: the live operating dashboard. Dense, functional, real pipeline.

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
  jury: 'Jury',
  greenlight: 'Greenlight',
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

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString('en-GB', { hour12: false })
}
function money(n: number) {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

const statusChip = (s: OrderStatus) =>
  'mono shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] ' +
  (s === 'greenlight' || s === 'review'
    ? 'border-emerald-400/40 text-emerald-300'
    : s === 'delivered'
      ? 'border-white/10 text-zinc-400'
      : 'border-amber-400/30 text-amber-300')

export default function StudioPage() {
  const [data, setData] = useState<ApiState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
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
    const id = setInterval(poll, 1100)
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
  const cogsDelivered = shipped.reduce((s, o) => s + o.cogsUsd, 0)
  const grossMargin =
    state.revenue > 0 ? (((state.revenue - cogsDelivered) / state.revenue) * 100).toFixed(1) : null
  const winnerDraft = selected?.drafts.find((d) => d.agentId === selected.winnerAgentId)
  const selectedEvents = selected ? state.events.filter((e) => e.orderId === selected.id) : []

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/8 bg-[#0b0b0d] px-4">
        <div className="flex items-center gap-3">
          <a href="/" className="btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]">
            <ArrowLeft size={13} /> Site
          </a>
          <span className="display text-[16px] font-semibold tracking-tight">Aria Studio</span>
          <span className="mono rounded-full border border-emerald-400/30 px-2.5 py-0.5 text-[10.5px] text-emerald-300">
            CONTROL ROOM / LIVE PIPELINE
          </span>
        </div>
        <div className="mono flex items-center gap-4 text-[12px] text-zinc-400">
          <span>
            revenue <span className="font-medium text-emerald-400">{money(state.revenue)}</span>
          </span>
          <span>
            margin <span className="text-zinc-100">{grossMargin ? `${grossMargin}%` : '--'}</span>
          </span>
          <span>
            shipped <span className="text-zinc-100">{state.delivered}</span>
          </span>
          <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-zinc-200">CEO {data.company.ceo}</span>
        </div>
      </header>

      {/* workbench */}
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_370px]">
        {/* LEFT: intake + queue */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-white/8 p-3">
          <div className="card-quiet p-3">
            <div className="display text-[13.5px] font-semibold">Fire a brief</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {templates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => post('/api/orders', { template: i })}
                  className="btn-ghost flex items-center justify-between rounded-lg px-3 py-2 text-left text-[12px]"
                >
                  <span>
                    {t.client} <span className="text-zinc-500">/ {t.vertical}</span>
                  </span>
                  <span className="mono text-zinc-400">{money(t.amountUsd)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="s-client" className="mb-0.5 block text-[10.5px] text-zinc-500">
                    Client
                  </label>
                  <input
                    id="s-client"
                    value={custom.client}
                    onChange={(e) => setCustom({ ...custom, client: e.target.value })}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11.5px] outline-none focus:border-emerald-400/50"
                  />
                </div>
                <div>
                  <label htmlFor="s-usd" className="mb-0.5 block text-[10.5px] text-zinc-500">
                    Budget
                  </label>
                  <input
                    id="s-usd"
                    type="number"
                    value={custom.amountUsd}
                    onChange={(e) => setCustom({ ...custom, amountUsd: Number(e.target.value) })}
                    className="mono w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11.5px] outline-none focus:border-emerald-400/50"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="s-vert" className="mb-0.5 block text-[10.5px] text-zinc-500">
                  Vertical
                </label>
                <select
                  id="s-vert"
                  value={custom.vertical}
                  onChange={(e) => setCustom({ ...custom, vertical: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-[#131316] px-2 py-1.5 text-[11.5px] text-zinc-200 outline-none focus:border-emerald-400/50"
                >
                  <option>product ad</option>
                  <option>travel promo</option>
                  <option>science explainer</option>
                  <option>brand film</option>
                </select>
              </div>
              <div>
                <label htmlFor="s-title" className="mb-0.5 block text-[10.5px] text-zinc-500">
                  Title
                </label>
                <input
                  id="s-title"
                  value={custom.title}
                  onChange={(e) => setCustom({ ...custom, title: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11.5px] outline-none focus:border-emerald-400/50"
                />
              </div>
              <div>
                <label htmlFor="s-brief" className="mb-0.5 block text-[10.5px] text-zinc-500">
                  Brief
                </label>
                <textarea
                  id="s-brief"
                  rows={3}
                  value={custom.brief}
                  onChange={(e) => setCustom({ ...custom, brief: e.target.value })}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11.5px] leading-relaxed outline-none focus:border-emerald-400/50"
                />
              </div>
              <button
                onClick={() => post('/api/orders', custom)}
                className="btn-primary flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold"
              >
                <Lightning size={14} weight="bold" /> Lock escrow and run
              </button>
            </div>
          </div>

          <details className="card-quiet p-3">
            <summary className="display cursor-pointer text-[13.5px] font-semibold">CEO Playbook</summary>
            <textarea
              value={playbookDraft ?? state.playbook}
              onChange={(e) => setPlaybookDraft(e.target.value)}
              rows={7}
              className="mt-2 w-full rounded-md border border-white/10 bg-white/5 p-2 text-[11px] leading-relaxed outline-none focus:border-emerald-400/50"
            />
            <button
              onClick={() => post('/api/playbook', { playbook: playbookDraft })}
              className="btn-ghost mt-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium"
            >
              Save
            </button>
          </details>

          <div className="card-quiet flex min-h-0 flex-1 flex-col p-3">
            <div className="display text-[13.5px] font-semibold">Queue</div>
            <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={
                    'w-full rounded-lg border p-2.5 text-left transition-colors ' +
                    (selectedId === o.id
                      ? 'border-emerald-400/40 bg-emerald-400/5'
                      : 'border-white/8 bg-white/[0.02] hover:border-white/20')
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11.5px] font-medium">{o.title}</span>
                    <span className={statusChip(o.status)}>{STATUS_LABEL[o.status]}</span>
                  </div>
                  <div className="mono mt-0.5 text-[10.5px] text-zinc-500">
                    {o.client} / {money(o.amountUsd)}
                  </div>
                  {o.status === 'producing' && (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${o.videoProgress ?? 2}%` }}
                      />
                    </div>
                  )}
                </button>
              ))}
              {orders.length === 0 && <div className="text-[11.5px] text-zinc-600">No orders yet. Fire a brief.</div>}
            </div>
          </div>
        </div>

        {/* CENTER: the stage */}
        <div className="min-h-0 overflow-y-auto p-4">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-[13px] text-zinc-600">
              Select or fire an order
            </div>
          ) : (
            <div className="mx-auto max-w-[880px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mono text-[11px] text-zinc-500">
                    {selected.client} / {selected.vertical} /{' '}
                    <span className="text-zinc-300">{money(selected.amountUsd)} in escrow</span>
                    {selected.revision > 0 && <span className="text-amber-400"> / rev {selected.revision}</span>}
                  </div>
                  <h1 className="display mt-0.5 text-[22px] font-semibold tracking-tight">{selected.title}</h1>
                </div>
                <span className={statusChip(selected.status)}>{STATUS_LABEL[selected.status]}</span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{selected.brief}</p>

              {/* stepper */}
              <div className="mono mt-3 flex flex-wrap items-center gap-1 text-[10.5px]">
                {(['Concepts', 'Jury', 'Greenlight', 'Render', 'Gate', 'Paid'] as const).map((lbl, i) => {
                  const reached = [
                    selected.status !== 'inbox',
                    selected.duels.length > 0,
                    !!selected.winnerAgentId,
                    !!selected.videoFile || selected.status === 'producing' || !!selected.videoNote,
                    selected.status === 'review' || selected.status === 'delivered',
                    selected.status === 'delivered',
                  ][i]
                  return (
                    <span key={lbl} className="flex items-center gap-1">
                      {i > 0 && <span className={reached ? 'text-emerald-400/60' : 'text-zinc-700'}>-</span>}
                      <span
                        className={
                          'rounded-full border px-2 py-0.5 ' +
                          (reached ? 'border-emerald-400/40 text-emerald-300' : 'border-white/10 text-zinc-600')
                        }
                      >
                        {lbl}
                      </span>
                    </span>
                  )
                })}
              </div>

              {/* concepting: skeletons */}
              {(selected.status === 'concepting' || selected.status === 'inbox') && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {agents.map((a) => (
                    <div key={a.id} className="card-quiet p-3">
                      <div className="mono text-[11px] text-zinc-400">
                        {a.name} <span className="text-zinc-600">{a.role}</span>
                      </div>
                      <div className="shimmer mt-3 h-2 w-full rounded-full" />
                      <div className="shimmer mt-2 h-2 w-2/3 rounded-full" />
                      <div className="pulse-soft mono mt-3 text-[10.5px] text-amber-300/80">concepting</div>
                    </div>
                  ))}
                </div>
              )}

              {/* jury: live duel feed */}
              {selected.status === 'jury' && (
                <div className="card-quiet mt-4 p-4">
                  <div className="mono pulse-soft text-[11px] text-amber-300">
                    jury in session: pairwise duels, Bradley-Terry aggregation
                  </div>
                  <div className="mt-2 space-y-1">
                    {selectedEvents
                      .filter((e) => e.tag === 'DUEL')
                      .map((e, i) => (
                        <div key={i} className="mono text-[11px] leading-relaxed text-zinc-400">
                          {e.text}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* greenlight: the human pick */}
              {selected.status === 'greenlight' && (
                <div className="mt-4">
                  <div className="mono mb-2 text-[11px] text-emerald-300">
                    GATE 1 / pick the concept to fund. Concepts cost cents, the render costs about $0.27.
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {selected.ranking.map((r, idx) => {
                      const d = selected.drafts.find((x) => x.agentId === r.agentId)!
                      const a = agentOf(r.agentId)!
                      return (
                        <div
                          key={r.agentId}
                          className={
                            'flex flex-col rounded-xl border p-3.5 ' +
                            (idx === 0 ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/8 bg-white/[0.02]')
                          }
                        >
                          <div className="mono flex items-center justify-between text-[10.5px] text-zinc-500">
                            <span>
                              {a.name} / {a.role}
                            </span>
                            {idx === 0 && <span className="text-emerald-300">jury pick</span>}
                          </div>
                          <div className="display mt-1 text-[16px] font-semibold">{d.concept.concept}</div>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">{d.concept.hook}</p>
                          <ol className="mt-2 space-y-0.5">
                            {d.concept.beats.map((b, i) => (
                              <li key={i} className="mono text-[10.5px] text-zinc-500">
                                {i + 1}. {b}
                              </li>
                            ))}
                          </ol>
                          <div className="mono mt-2 text-[10.5px] italic leading-relaxed text-zinc-600">
                            {d.concept.style}
                          </div>
                          <div className="nums mono mt-2 flex items-center gap-2 text-[10.5px] text-zinc-500">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-emerald-400/80"
                                style={{ width: `${Math.max(6, r.score * 100)}%` }}
                              />
                            </div>
                            {(r.score * 100).toFixed(0)}% / {r.wins}W
                          </div>
                          <button
                            onClick={() => post('/api/greenlight', { orderId: selected.id, agentId: r.agentId })}
                            className={
                              'mt-3 w-full rounded-lg px-3 py-2 text-[12px] font-semibold ' +
                              (idx === 0 ? 'btn-primary' : 'btn-ghost')
                            }
                          >
                            {idx === 0 ? 'Greenlight' : 'Override and fund'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* producing / review / delivered: video stage */}
              {(selected.status === 'producing' ||
                selected.status === 'review' ||
                selected.status === 'revising' ||
                selected.status === 'delivered') && (
                <div className="mt-4 grid grid-cols-[260px_minmax(0,1fr)] gap-4">
                  <div>
                    {selected.videoFile ? (
                      <video
                        key={selected.videoFile}
                        src={selected.videoFile}
                        controls
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="w-full rounded-xl border border-white/15"
                      />
                    ) : selected.status === 'producing' ? (
                      <div className="card-quiet flex aspect-[9/16] flex-col items-center justify-center gap-3 p-4">
                        <FilmSlate size={22} className="text-emerald-400" />
                        <div className="mono text-3xl font-semibold">{selected.videoProgress ?? 0}%</div>
                        <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                            style={{ width: `${selected.videoProgress ?? 2}%` }}
                          />
                        </div>
                        <div className="mono text-center text-[10px] text-zinc-500">
                          seedance 2.0 mini / 5s / 9:16
                        </div>
                      </div>
                    ) : (
                      <div className="card-quiet flex aspect-[9/16] items-center justify-center p-4 text-center">
                        <span className="mono text-[10.5px] text-amber-300/80">
                          {selected.videoNote ?? STATUS_LABEL[selected.status]}
                        </span>
                      </div>
                    )}
                    {selected.posterFile && (
                      <img
                        src={selected.posterFile}
                        alt="Campaign key visual"
                        className="mt-2 w-full rounded-xl border border-white/10"
                      />
                    )}
                  </div>
                  <div>
                    <div className="card-quiet p-3.5">
                      <div className="mono text-[10.5px] text-zinc-500">
                        winning concept by {agentOf(selected.winnerAgentId)?.name}
                      </div>
                      <div className="display mt-0.5 text-[17px] font-semibold">{winnerDraft?.concept.concept}</div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">{winnerDraft?.concept.hook}</p>
                      <div className="mono mt-2 text-[10.5px] leading-relaxed text-zinc-600">
                        {winnerDraft?.concept.video_prompt}
                      </div>
                      <div className="mono mt-3 flex gap-5 border-t border-white/8 pt-2.5 text-[11.5px] text-zinc-400">
                        <span>
                          price <span className="text-zinc-100">{money(selected.amountUsd)}</span>
                        </span>
                        <span>
                          cogs <span className="text-zinc-100">${selected.cogsUsd.toFixed(2)}</span>
                        </span>
                        <span>
                          margin{' '}
                          <span className="text-emerald-400">
                            {(((selected.amountUsd - selected.cogsUsd) / selected.amountUsd) * 100).toFixed(1)}%
                          </span>
                        </span>
                      </div>
                    </div>

                    {selected.status === 'review' && (
                      <div className="mt-3">
                        <div className="mono mb-1.5 text-[11px] text-emerald-300">
                          GATE 2 / your acceptance releases the escrow
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => post('/api/review', { orderId: selected.id, action: 'approve' })}
                            className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold"
                          >
                            <CheckCircle size={15} weight="bold" /> Accept and settle
                          </button>
                          <input
                            aria-label="CEO revision notes"
                            placeholder="Notes for the revision"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] outline-none placeholder:text-zinc-600 focus:border-emerald-400/50"
                          />
                          <button
                            onClick={() => {
                              post('/api/review', { orderId: selected.id, action: 'revise', feedback: feedbackText })
                              setFeedbackText('')
                            }}
                            className="btn-ghost flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-medium"
                          >
                            <ArrowUUpLeft size={13} /> Send back
                          </button>
                        </div>
                      </div>
                    )}

                    {selected.status === 'delivered' && selected.invoice && (
                      <div className="card-quiet mt-3 p-3.5">
                        <div className="flex items-center justify-between">
                          <span className="mono text-[12px] font-medium text-zinc-200">{selected.invoice.id}</span>
                          <span className="mono text-[12.5px] font-semibold text-emerald-400">
                            {money(selected.amountUsd)} settled
                          </span>
                        </div>
                        <div className="mono mt-1 break-all text-[10.5px] text-zinc-600">
                          {selected.invoice.ref.includes('https://') ? (
                            <>
                              {selected.invoice.ref.split('https://')[0]}
                              <a
                                href={'https://' + selected.invoice.ref.split('https://')[1]}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-400 underline decoration-emerald-400/40"
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
                  </div>
                </div>
              )}

              {/* jury detail */}
              {selected.duels.length > 0 && selected.status !== 'jury' && (
                <details className="mt-4">
                  <summary className="mono cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
                    jury detail: {selected.duels.length} duels, Bradley-Terry aggregate
                  </summary>
                  <div className="card-quiet mt-2 space-y-1 p-3">
                    {selected.duels.map((d, i) => (
                      <div key={i} className="mono text-[10.5px] leading-relaxed text-zinc-500">
                        {agentOf(d.a)?.name} vs {agentOf(d.b)?.name} / {d.judge} picked{' '}
                        <span className="text-zinc-200">{agentOf(d.winner)?.name}</span>: {d.reason}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: feed + economics */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden border-l border-white/8 p-3">
          <div className="card-quiet grid shrink-0 grid-cols-3 gap-2 p-3 text-center">
            <div>
              <div className="mono text-[10px] text-zinc-500">avg order</div>
              <div className="mono mt-0.5 text-[15px] font-semibold">
                {shipped.length ? money(state.revenue / shipped.length) : '--'}
              </div>
            </div>
            <div>
              <div className="mono text-[10px] text-zinc-500">avg cogs</div>
              <div className="mono mt-0.5 text-[15px] font-semibold">
                {shipped.length ? '$' + (cogsDelivered / shipped.length).toFixed(2) : '--'}
              </div>
            </div>
            <div>
              <div className="mono text-[10px] text-zinc-500">margin</div>
              <div className="mono mt-0.5 text-[15px] font-semibold text-emerald-400">
                {grossMargin ? `${grossMargin}%` : '--'}
              </div>
            </div>
          </div>
          <div className="card-quiet shrink-0 p-3">
            <div className="mono text-[10px] uppercase tracking-wide text-zinc-500">The team</div>
            <div className="mt-2 space-y-1.5">
              {agents.map((a) => (
                <div key={a.id} className="mono flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300">
                    {a.name} <span className="text-zinc-600">{a.role}</span>
                  </span>
                  <span className="flex items-center gap-2 text-zinc-500">
                    rep {a.reputation}
                    <span
                      className={
                        'h-1.5 w-1.5 rounded-full ' +
                        (a.status === 'working' ? 'pulse-soft bg-amber-400' : 'bg-emerald-400/80')
                      }
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card-quiet flex min-h-0 flex-1 flex-col p-3">
            <div className="mono shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">Live feed</div>
            <div className="mono mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-[10.5px] leading-relaxed">
              {state.events.map((e, i) => (
                <div key={i} className={'flex gap-1.5 ' + (selected && e.orderId === selected.id ? '' : 'opacity-60')}>
                  <span className="shrink-0 text-zinc-600">{fmtTime(e.t)}</span>
                  <span className={'shrink-0 font-medium ' + (TAG_STYLE[e.tag] ?? 'text-zinc-400')}>{e.tag}</span>
                  <span className={i === 0 ? 'text-zinc-200' : 'text-zinc-500'}>{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
