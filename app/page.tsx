'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

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

const STEPS: { key: string; label: string; reached: (o: Order) => boolean }[] = [
  { key: 'concepts', label: 'Concepts', reached: (o) => o.status !== 'inbox' },
  { key: 'jury', label: 'Jury', reached: (o) => o.duels.length > 0 },
  { key: 'greenlight', label: 'Greenlight', reached: (o) => !!o.winnerAgentId },
  {
    key: 'render',
    label: 'Render',
    reached: (o) => !!o.videoFile || o.status === 'producing' || !!o.videoNote,
  },
  { key: 'gate', label: 'Gate', reached: (o) => o.status === 'review' || o.status === 'delivered' },
  { key: 'paid', label: 'Paid', reached: (o) => o.status === 'delivered' },
]

const TAG_STYLE: Record<string, string> = {
  DUEL: 'text-amber-300',
  RANK: 'text-amber-200',
  JURY: 'text-amber-300',
  GLGHT: 'text-indigo-300',
  PROD: 'text-violet-300',
  IMG: 'text-violet-300',
  GATE: 'text-zinc-100',
  PAID: 'text-emerald-400',
  CHAIN: 'text-emerald-300',
  ESCROW: 'text-sky-300',
  REV: 'text-orange-300',
  ERR: 'text-red-400',
  BOOK: 'text-zinc-300',
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

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString('en-GB', { hour12: false })
}
function money(n: number) {
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export default function Page() {
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
          ({ greenlight: 0, review: 1, producing: 2, jury: 3, concepting: 4, revising: 2, inbox: 5, delivered: 6 })[s]
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
      <div className="flex h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-sm text-zinc-500">Loading SoloCorp Studio</div>
      </div>
    )
  }

  const { state, agents, templates, company } = data
  const orders = state.orders
  const selected = orders.find((o) => o.id === selectedId) ?? null
  const agentOf = (id?: string) => agents.find((a) => a.id === id)
  const shipped = orders.filter((o) => o.status === 'delivered')
  const active = orders.filter((o) => o.status !== 'delivered')
  const cogsDelivered = shipped.reduce((s, o) => s + o.cogsUsd, 0)
  const grossMargin =
    state.revenue > 0 ? (((state.revenue - cogsDelivered) / state.revenue) * 100).toFixed(1) : null
  const winnerDraft = selected?.drafts.find((d) => d.agentId === selected.winnerAgentId)

  return (
    <div className="min-h-screen">
      <div className="hero-glow">
        {/* nav */}
        <nav className="mx-auto flex max-w-[1500px] items-center justify-between px-6 pb-2 pt-5">
          <div className="flex items-baseline gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-3.5 w-3.5 rounded-[5px] bg-gradient-to-br from-[#635bff] to-[#9066ff]" />
              <span className="text-[17px] font-semibold tracking-tight">SoloCorp Studio</span>
            </div>
            <span className="hidden text-[13px] text-zinc-500 md:inline">
              a one-person media company, run by agents
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="card-quiet nums px-3.5 py-1.5 text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Revenue</div>
              <div className="text-[15px] font-semibold text-emerald-400">{money(state.revenue)}</div>
            </div>
            <div className="card-quiet nums px-3.5 py-1.5 text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Gross margin</div>
              <div className="text-[15px] font-semibold">{grossMargin ? `${grossMargin}%` : '--'}</div>
            </div>
            <div className="card-quiet nums px-3.5 py-1.5 text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Shipped</div>
              <div className="text-[15px] font-semibold">{state.delivered}</div>
            </div>
            <div className="card-quiet px-3.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">CEO</div>
              <div className="text-[13px] font-medium">{company.ceo}</div>
            </div>
          </div>
        </nav>

        {/* hero stage */}
        <section className="mx-auto grid max-w-[1500px] grid-cols-1 gap-8 px-6 py-6 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* stage */}
          <div className="flex items-start gap-3">
            {!selected ? (
              <div className="card flex aspect-[9/16] w-full items-center justify-center">
                <span className="text-sm text-zinc-500">No order selected</span>
              </div>
            ) : selected.videoFile ? (
              <video
                key={selected.videoFile}
                src={selected.videoFile}
                controls
                autoPlay
                muted
                loop
                playsInline
                className="w-full rounded-2xl border border-white/10 shadow-2xl"
              />
            ) : selected.status === 'producing' ? (
              <div className="card flex aspect-[9/16] w-full flex-col items-center justify-center gap-4 p-6">
                <div className="text-[11px] uppercase tracking-widest text-violet-300">
                  Studio rendering
                </div>
                <div className="nums text-5xl font-semibold">{selected.videoProgress ?? 0}%</div>
                <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#635bff] to-[#9066ff] transition-all duration-700"
                    style={{ width: `${selected.videoProgress ?? 2}%` }}
                  />
                </div>
                <div className="text-center text-[11px] text-zinc-500">
                  Seedance 2.0 mini / 5s / 9:16
                  <br />
                  poster rendering in parallel
                </div>
              </div>
            ) : selected.status === 'concepting' || selected.status === 'jury' || selected.status === 'inbox' ? (
              <div className="card flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 p-6">
                <div className="shimmer h-2 w-2/3 rounded-full" />
                <div className="shimmer h-2 w-1/2 rounded-full" />
                <div className="mt-2 text-[12px] text-zinc-400">{STATUS_LABEL[selected.status]}</div>
              </div>
            ) : selected.status === 'greenlight' ? (
              <div className="card flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="text-[11px] uppercase tracking-widest text-indigo-300">
                  Awaiting your greenlight
                </div>
                <div className="text-[13px] text-zinc-400">
                  Jury pick:{' '}
                  <span className="text-zinc-100">
                    {selected.drafts.find((d) => d.agentId === selected.ranking[0]?.agentId)?.concept.concept}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500">
                  Approve a concept on the right to start the render spend
                </div>
              </div>
            ) : (
              <div className="card flex aspect-[9/16] w-full items-center justify-center p-6 text-center">
                <span className="text-[12px] text-amber-300/90">
                  {selected.videoNote ?? 'Revising'}
                </span>
              </div>
            )}
            {selected?.posterFile && (
              <img
                src={selected.posterFile}
                alt="campaign poster"
                className="hover-lift w-[92px] rounded-xl border border-white/10"
                title="Campaign key visual (gpt-image-2)"
              />
            )}
          </div>

          {/* order panel */}
          <div className="min-w-0">
            {selected && (
              <>
                <div className="flex items-center gap-2 text-[12px] text-zinc-400">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5">
                    {selected.vertical}
                  </span>
                  <span>{selected.client}</span>
                  <span className="text-zinc-600">/</span>
                  <span className="nums font-medium text-zinc-200">{money(selected.amountUsd)} in escrow</span>
                  {selected.revision > 0 && (
                    <span className="text-orange-300">rev {selected.revision}</span>
                  )}
                </div>
                <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{selected.title}</h1>
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-zinc-400">
                  {selected.brief}
                </p>

                {/* stepper */}
                <div className="mt-4 flex items-center gap-1.5">
                  {STEPS.map((s, i) => {
                    const on = selected ? s.reached(selected) : false
                    return (
                      <div key={s.key} className="flex items-center gap-1.5">
                        {i > 0 && <div className={'h-px w-6 ' + (on ? 'bg-indigo-400/60' : 'bg-white/10')} />}
                        <div
                          className={
                            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ' +
                            (on
                              ? 'border-indigo-400/40 bg-indigo-500/10 text-indigo-200'
                              : 'border-white/10 text-zinc-500')
                          }
                        >
                          {s.label}
                        </div>
                      </div>
                    )
                  })}
                  <span className="ml-2 text-[11px] text-zinc-500">{STATUS_LABEL[selected.status]}</span>
                </div>

                {/* greenlight: concept picker */}
                {selected.status === 'greenlight' && (
                  <div className="mt-5">
                    <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-zinc-400">
                      Pick the concept to fund
                      <span className="ml-2 normal-case text-zinc-500">
                        concepts cost cents, renders cost dollars, you gate the spend
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {selected.ranking.map((r, idx) => {
                        const d = selected.drafts.find((x) => x.agentId === r.agentId)!
                        const a = agentOf(r.agentId)!
                        return (
                          <div key={r.agentId} className={'card hover-lift p-3.5 ' + (idx === 0 ? 'ring-1 ring-indigo-400/40' : '')}>
                            <div className="flex items-center justify-between">
                              <div className="text-[12px] text-zinc-400">
                                {a.name} <span className="text-zinc-600">{a.role}</span>
                              </div>
                              {idx === 0 && (
                                <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                                  Jury pick
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[15px] font-semibold">{d.concept.concept}</div>
                            <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-zinc-400">
                              {d.concept.hook}
                            </p>
                            <div className="nums mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#635bff] to-[#9066ff]"
                                  style={{ width: `${Math.max(6, r.score * 100)}%` }}
                                />
                              </div>
                              {(r.score * 100).toFixed(0)}% / {r.wins}W
                            </div>
                            <button
                              onClick={() =>
                                post('/api/greenlight', { orderId: selected.id, agentId: r.agentId })
                              }
                              className={
                                'mt-3 w-full rounded-lg px-3 py-2 text-[12px] font-medium ' +
                                (idx === 0 ? 'btn-primary text-white' : 'btn-ghost text-zinc-200')
                              }
                            >
                              {idx === 0 ? 'Greenlight jury pick' : 'Override and fund this'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* review: acceptance */}
                {selected.status === 'review' && (
                  <div className="mt-5 grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
                    <div className="card p-4">
                      <div className="text-[12px] text-zinc-400">
                        Winning concept by {agentOf(selected.winnerAgentId)?.name}
                      </div>
                      <div className="mt-0.5 text-[16px] font-semibold">
                        {winnerDraft?.concept.concept}
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                        {winnerDraft?.concept.hook}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <input
                          placeholder="CEO notes: hook harder, warmer light, tighter ending"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] outline-none placeholder:text-zinc-600 focus:border-indigo-400/50"
                        />
                        <button
                          onClick={() => {
                            post('/api/review', {
                              orderId: selected.id,
                              action: 'revise',
                              feedback: feedbackText,
                            })
                            setFeedbackText('')
                          }}
                          className="btn-ghost rounded-lg px-3 py-2 text-[12px] font-medium text-zinc-200"
                        >
                          Send back
                        </button>
                      </div>
                    </div>
                    <div className="card flex flex-col justify-between p-4">
                      <div className="nums space-y-1.5 text-[12px]">
                        <div className="flex justify-between text-zinc-400">
                          <span>Price</span>
                          <span className="text-zinc-100">{money(selected.amountUsd)}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>COGS (est.)</span>
                          <span className="text-zinc-100">${selected.cogsUsd.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span className="text-zinc-300">Margin</span>
                          <span className="text-emerald-400">
                            {(((selected.amountUsd - selected.cogsUsd) / selected.amountUsd) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => post('/api/review', { orderId: selected.id, action: 'approve' })}
                        className="btn-primary mt-3 w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white"
                      >
                        Accept and release escrow
                      </button>
                    </div>
                  </div>
                )}

                {/* delivered: invoice */}
                {selected.status === 'delivered' && selected.invoice && (
                  <div className="card mt-5 max-w-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-medium">{selected.invoice.id}</div>
                      <div className="nums text-[13px] font-semibold text-emerald-400">
                        {money(selected.amountUsd)} settled
                      </div>
                    </div>
                    <div className="nums mt-1 text-[11px] text-zinc-500">
                      COGS ${selected.cogsUsd.toFixed(2)} / margin{' '}
                      {(((selected.amountUsd - selected.cogsUsd) / selected.amountUsd) * 100).toFixed(1)}% /{' '}
                      {fmtTime(selected.invoice.paidAt)}
                    </div>
                    <div className="mt-1 break-all text-[11px] text-zinc-600">
                      {selected.invoice.ref.includes('https://') ? (
                        <>
                          {selected.invoice.ref.split('https://')[0]}
                          <a
                            href={'https://' + selected.invoice.ref.split('https://')[1]}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-300 underline decoration-indigo-300/40 hover:text-indigo-200"
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
                  <details className="mt-4 max-w-3xl">
                    <summary className="cursor-pointer text-[12px] text-zinc-500 hover:text-zinc-300">
                      Jury detail: {selected.duels.length} pairwise duels, Bradley-Terry aggregate
                    </summary>
                    <div className="card-quiet mt-2 space-y-1 p-3">
                      {selected.ranking.map((r) => {
                        const a = agentOf(r.agentId)
                        return (
                          <div key={r.agentId} className="nums flex items-center gap-2 text-[11px]">
                            <span className="w-16 text-zinc-300">{a?.name}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-indigo-400/70"
                                style={{ width: `${Math.max(5, r.score * 100)}%` }}
                              />
                            </div>
                            <span className="w-16 text-right text-zinc-500">
                              {(r.score * 100).toFixed(0)}% / {r.wins}W
                            </span>
                          </div>
                        )
                      })}
                      <div className="pt-1.5">
                        {selected.duels.map((d, i) => (
                          <div key={i} className="text-[11px] leading-relaxed text-zinc-500">
                            <span className="text-zinc-400">
                              {agentOf(d.a)?.name} vs {agentOf(d.b)?.name}
                            </span>{' '}
                            / {d.judge} picked{' '}
                            <span className="text-zinc-200">{agentOf(d.winner)?.name}</span>: {d.reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {/* order intake */}
      <section className="mx-auto max-w-[1500px] px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[12px] font-medium uppercase tracking-wider text-zinc-500">
            New brief
          </span>
          {templates.map((t, i) => (
            <button
              key={i}
              onClick={() => post('/api/orders', { template: i })}
              className="btn-ghost rounded-full px-3.5 py-1.5 text-[12px] text-zinc-200"
            >
              {t.client} <span className="text-zinc-500">{t.vertical}</span>{' '}
              <span className="nums text-zinc-400">{money(t.amountUsd)}</span>
            </button>
          ))}
          <button
            onClick={() => setShowCustom((v) => !v)}
            className="btn-ghost rounded-full px-3.5 py-1.5 text-[12px] text-zinc-300"
          >
            + custom
          </button>
          <button
            onClick={() => {
              setPlaybookDraft(state.playbook)
              setShowPlaybook((v) => !v)
            }}
            className="btn-ghost rounded-full px-3.5 py-1.5 text-[12px] text-zinc-300"
            title="The human experience layer: standing creative rules every agent obeys"
          >
            Playbook
          </button>
        </div>

        {showCustom && (
          <div className="card mt-3 flex flex-wrap items-end gap-2 p-3">
            <input
              placeholder="Client"
              value={custom.client}
              onChange={(e) => setCustom({ ...custom, client: e.target.value })}
              className="w-36 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] outline-none placeholder:text-zinc-600 focus:border-indigo-400/50"
            />
            <select
              value={custom.vertical}
              onChange={(e) => setCustom({ ...custom, vertical: e.target.value })}
              className="rounded-lg border border-white/10 bg-[#141417] px-2 py-2 text-[12px] text-zinc-200 outline-none"
            >
              <option>product ad</option>
              <option>travel promo</option>
              <option>science explainer</option>
              <option>brand film</option>
            </select>
            <input
              placeholder="Order title, e.g. 5s vertical bumper for ..."
              value={custom.title}
              onChange={(e) => setCustom({ ...custom, title: e.target.value })}
              className="w-72 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] outline-none placeholder:text-zinc-600 focus:border-indigo-400/50"
            />
            <input
              placeholder="Brief: audience, feel, what to end on"
              value={custom.brief}
              onChange={(e) => setCustom({ ...custom, brief: e.target.value })}
              className="min-w-[260px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] outline-none placeholder:text-zinc-600 focus:border-indigo-400/50"
            />
            <input
              type="number"
              value={custom.amountUsd}
              onChange={(e) => setCustom({ ...custom, amountUsd: Number(e.target.value) })}
              className="nums w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] outline-none focus:border-indigo-400/50"
            />
            <button
              onClick={() => {
                post('/api/orders', custom)
                setShowCustom(false)
              }}
              className="btn-primary rounded-lg px-4 py-2 text-[12px] font-semibold text-white"
            >
              Lock escrow
            </button>
          </div>
        )}

        {showPlaybook && (
          <div className="card mt-3 p-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
              CEO Playbook: the human experience layer, injected into every agent prompt
            </div>
            <textarea
              value={playbookDraft ?? state.playbook}
              onChange={(e) => setPlaybookDraft(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-[12px] leading-relaxed outline-none focus:border-indigo-400/50"
            />
            <button
              onClick={() => {
                post('/api/playbook', { playbook: playbookDraft })
                setShowPlaybook(false)
              }}
              className="btn-primary mt-2 rounded-lg px-4 py-2 text-[12px] font-semibold text-white"
            >
              Save playbook
            </button>
          </div>
        )}

        {/* active pipeline ribbon */}
        {active.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {active.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={
                  'card-quiet hover-lift shrink-0 px-3.5 py-2.5 text-left ' +
                  (selectedId === o.id ? 'ring-1 ring-indigo-400/50' : '')
                }
              >
                <div className="max-w-[220px] truncate text-[12px] font-medium">{o.title}</div>
                <div className="nums mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span>{o.client}</span>
                  <span>{money(o.amountUsd)}</span>
                  <span
                    className={
                      o.status === 'greenlight'
                        ? 'text-indigo-300'
                        : o.status === 'review'
                          ? 'text-emerald-300'
                          : 'pulse-soft text-amber-300'
                    }
                  >
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
                {o.status === 'producing' && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#635bff] to-[#9066ff] transition-all"
                      style={{ width: `${o.videoProgress ?? 2}%` }}
                    />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* showcase */}
      <section className="mx-auto max-w-[1500px] px-6 py-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Shipped work</h2>
            <p className="text-[12px] text-zinc-500">
              Every card is a real render, accepted by a human, settled from escrow.
            </p>
          </div>
          {shipped.length > 0 && (
            <div className="nums text-[12px] text-zinc-500">
              {shipped.length} deliverables / {money(state.revenue)} collected
            </div>
          )}
        </div>
        {shipped.length === 0 ? (
          <div className="card-quiet flex h-40 items-center justify-center text-[13px] text-zinc-600">
            Nothing shipped yet. Lock a brief above and run it through the studio.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {shipped.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setSelectedId(o.id)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="hover-lift group relative overflow-hidden rounded-xl border border-white/10 text-left"
              >
                {o.videoFile ? (
                  <video
                    src={o.videoFile}
                    muted
                    loop
                    autoPlay
                    playsInline
                    className="aspect-[9/16] w-full object-cover"
                  />
                ) : (
                  <img src={o.posterFile} alt="" className="aspect-[9/16] w-full object-cover" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-8">
                  <div className="text-[12px] font-medium leading-tight">{o.title}</div>
                  <div className="nums mt-0.5 flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{o.client}</span>
                    <span className="font-semibold text-emerald-400">{money(o.amountUsd)}</span>
                  </div>
                </div>
                {o.posterFile && (
                  <img
                    src={o.posterFile}
                    alt=""
                    className="absolute right-2 top-2 w-10 rounded-md border border-white/20 opacity-90"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* books: feed + team + P&L */}
      <section className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="card flex h-[300px] flex-col p-4">
          <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-zinc-500">
            Studio activity
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {state.events.map((e, i) => (
              <div key={i} className="flex gap-2 text-[12px] leading-snug">
                <span className="nums shrink-0 text-zinc-600">{fmtTime(e.t)}</span>
                <span className={'shrink-0 font-medium ' + (TAG_STYLE[e.tag] ?? 'text-zinc-300')}>
                  {e.tag}
                </span>
                <span className={i === 0 ? 'text-zinc-200' : 'text-zinc-500'}>{e.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="card p-4">
            <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-zinc-500">
              The team
            </div>
            <div className="space-y-2.5">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#635bff]/30 to-[#9066ff]/30 text-[11px] font-semibold text-indigo-200">
                    {a.tag}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">
                      {a.name} <span className="font-normal text-zinc-500">{a.role}</span>
                    </div>
                    <div className="nums text-[11px] text-zinc-500">
                      rep {a.reputation} / {a.delivered} shipped / ${a.feeUsd} per concept
                    </div>
                  </div>
                  <span
                    className={
                      'h-2 w-2 rounded-full ' +
                      (a.status === 'working' ? 'pulse-soft bg-amber-400' : 'bg-emerald-500/80')
                    }
                  />
                </div>
              ))}
              <div className="flex items-center gap-3 border-t border-white/5 pt-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-[10px] font-semibold text-amber-200">
                  JURY
                </span>
                <div className="text-[12px] text-zinc-400">
                  Pairwise duels + Bradley-Terry, claude-sonnet-5 on the founder&apos;s own relay
                </div>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-zinc-500">
              Unit economics
            </div>
            <div className="nums grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[11px] text-zinc-500">Avg order</div>
                <div className="text-[16px] font-semibold">
                  {shipped.length ? money(state.revenue / shipped.length) : '--'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Avg COGS</div>
                <div className="text-[16px] font-semibold">
                  {shipped.length ? '$' + (cogsDelivered / shipped.length).toFixed(2) : '--'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-zinc-500">Gross margin</div>
                <div className="text-[16px] font-semibold text-emerald-400">
                  {grossMargin ? `${grossMargin}%` : '--'}
                </div>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-600">
              Concepts and jury cost cents, the render costs dollars, and the human gate sits exactly
              where the money is spent and earned.
            </p>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1500px] items-center justify-between px-6 pb-6 pt-2 text-[11px] text-zinc-600">
        <span>
          OPC formula: Human Experience (Playbook) + AI Loop (concepts, jury, render) + Human Review
          (greenlight the spend, accept to release escrow)
        </span>
        <span>Jury mechanism: rank 1, GG24 Deep Funding L3 / BUIDL_OPC_Hackathon_SG 2026</span>
      </footer>
    </div>
  )
}
