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
type Order = {
  id: string
  client: string
  title: string
  brief: string
  amountUsd: number
  status: 'inbox' | 'concepting' | 'jury' | 'producing' | 'review' | 'revising' | 'delivered'
  createdAt: number
  revision: number
  drafts: Draft[]
  duels: Duel[]
  ranking: RankEntry[]
  winnerAgentId?: string
  videoFile?: string
  videoProgress?: number
  videoNote?: string
  invoice?: { id: string; paidAt: number; ref: string }
  error?: string
}
type Ev = { t: number; tag: string; text: string; orderId?: string }
type ApiState = {
  company: { name: string; ceo: string; vertical: string }
  state: { orders: Order[]; events: Ev[]; revenue: number; delivered: number; playbook: string }
  agents: Agent[]
  judges: string[]
  templates: { client: string; title: string; brief: string; amountUsd: number }[]
}

const COLUMNS: { key: string; title: string; match: (o: Order) => boolean }[] = [
  { key: 'inbox', title: '01 BRIEFS', match: (o) => o.status === 'inbox' },
  { key: 'concept', title: '02 CONCEPTS', match: (o) => o.status === 'concepting' || o.status === 'revising' },
  { key: 'jury', title: '03 JURY', match: (o) => o.status === 'jury' },
  { key: 'studio', title: '04 STUDIO', match: (o) => o.status === 'producing' },
  { key: 'gate', title: '05 CEO GATE', match: (o) => o.status === 'review' },
  { key: 'shipped', title: '06 SHIPPED', match: (o) => o.status === 'delivered' },
]

const TAG_COLOR: Record<string, string> = {
  VT: 'text-green-300',
  SB: 'text-green-300',
  PX: 'text-green-300',
  JURY: 'text-amber-300',
  DUEL: 'text-amber-300',
  RANK: 'text-amber-200',
  PROD: 'text-emerald-300',
  GATE: 'text-green-100',
  PAID: 'text-green-400',
  ESCROW: 'text-green-200',
  REV: 'text-orange-300',
  ERR: 'text-red-400',
  BOOK: 'text-green-200',
}

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString('en-GB', { hour12: false })
}

export default function Page() {
  const [data, setData] = useState<ApiState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewAgent, setViewAgent] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [showPlaybook, setShowPlaybook] = useState(false)
  const [playbookDraft, setPlaybookDraft] = useState<string | null>(null)
  const [custom, setCustom] = useState({ client: '', title: '', brief: '', amountUsd: 300 })
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' })
      const json: ApiState = await res.json()
      setData(json)
      if (!selectedRef.current && json.state.orders.length > 0) {
        const hot = json.state.orders.find((o) => o.status === 'review') ?? json.state.orders[0]
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
      <div className="flex h-screen items-center justify-center">
        <div className="mono cursor-blink glow text-green-400">BOOTING SOLOCORP_OS </div>
      </div>
    )
  }

  const { state, agents, templates, company } = data
  const selected = state.orders.find((o) => o.id === selectedId) ?? null
  const agentOf = (id: string) => agents.find((a) => a.id === id)
  const workingCount = agents.filter((a) => a.status === 'working').length
  const shipped = state.orders.filter((o) => o.status === 'delivered' && o.videoFile)
  const producing = state.orders.filter((o) => o.status === 'producing')

  const tickerItems = [
    `TREASURY $${state.revenue.toLocaleString()}`,
    `${state.delivered} SHIPPED`,
    `${state.orders.filter((o) => o.status !== 'delivered').length} IN PIPELINE`,
    workingCount ? `${workingCount} AGENT${workingCount > 1 ? 'S' : ''} WORKING` : 'AGENTS IDLE',
    producing.length ? `RENDERING ${producing.length} CUT${producing.length > 1 ? 'S' : ''}` : 'STUDIO READY',
    'JURY: 2x CLAUDE ON SELF-HOSTED RELAY',
    'SEEDANCE 2.0 RENDER PIPE LIVE',
    'ESCROW: ACCEPTANCE RELEASES FUNDS',
  ]

  return (
    <div className="mx-auto flex h-screen max-w-[1660px] flex-col gap-2.5 p-3">
      {/* ticker */}
      <div className="term-border-solid mono flex items-center gap-2 overflow-hidden rounded bg-[#0a120c] px-3 py-1 text-[11px] tracking-wide text-green-500/90">
        <span className="dot-working inline-block h-2 w-2 rounded-full bg-green-400" />
        <div className="flex gap-6 whitespace-nowrap">
          {tickerItems.map((it, i) => (
            <span key={i}>
              {it} <span className="text-green-800">/</span>
            </span>
          ))}
        </div>
      </div>

      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="mono glow text-2xl font-medium tracking-tight text-green-400">
            [SOLOCORP_OS]
          </h1>
          <p className="mono text-[12px] text-green-200/60">
            {'>'}_ 1 human x 3 agents = an ad studio. Real briefs, real footage, real invoices.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="mono text-[10px] uppercase tracking-widest text-green-200/50">Treasury</div>
            <div className="mono glow text-2xl font-medium text-green-400">
              ${state.revenue.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-[10px] uppercase tracking-widest text-green-200/50">Shipped</div>
            <div className="mono text-2xl font-medium text-green-100">{state.delivered}</div>
          </div>
          <div className="term-border rounded px-3 py-1.5">
            <div className="mono text-[10px] uppercase tracking-widest text-green-200/50">
              CEO / human gate
            </div>
            <div className="mono text-sm text-green-100">{company.ceo}</div>
          </div>
        </div>
      </div>

      {/* roster + commands */}
      <div className="flex flex-wrap items-stretch gap-2">
        {agents.map((a) => (
          <div
            key={a.id}
            className="term-border flex min-w-[200px] items-center gap-2.5 rounded bg-[#091009] px-3 py-2"
          >
            <span className="mono term-border-solid rounded px-1.5 py-0.5 text-[11px] text-green-300">
              {a.tag}
            </span>
            <div className="flex-1">
              <div className="mono text-[13px] text-green-100">
                {a.name}
                <span className="ml-1.5 text-[10px] text-green-200/50">{a.role}</span>
              </div>
              <div className="mono text-[10px] text-green-200/60">
                rep {a.reputation} / {a.delivered} shipped / ${a.feeUsd} per concept
              </div>
            </div>
            <span
              className={
                'inline-block h-2 w-2 rounded-full ' +
                (a.status === 'working' ? 'dot-working bg-amber-400' : 'bg-green-500/70')
              }
            />
          </div>
        ))}
        <div className="term-border flex min-w-[230px] items-center gap-2.5 rounded bg-[#091009] px-3 py-2">
          <span className="mono term-border-solid rounded px-1.5 py-0.5 text-[11px] text-amber-300">
            JURY
          </span>
          <div>
            <div className="mono text-[13px] text-green-100">Creative Jury</div>
            <div className="mono text-[10px] text-green-200/60">
              pairwise duels + Bradley-Terry, claude-sonnet-5
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {templates.map((t, i) => (
            <button
              key={i}
              onClick={() => post('/api/orders', { template: i })}
              className="term-border card-hover mono rounded bg-green-500/10 px-3 py-2 text-[11px] text-green-300 hover:bg-green-500/20"
            >
              + {t.client} ${t.amountUsd}
            </button>
          ))}
          <button
            onClick={() => setShowCustom((v) => !v)}
            className="term-border card-hover mono rounded px-3 py-2 text-[11px] text-green-200/70"
          >
            + custom
          </button>
          <button
            onClick={() => {
              setPlaybookDraft(state.playbook)
              setShowPlaybook((v) => !v)
            }}
            className="term-border card-hover mono rounded px-3 py-2 text-[11px] text-green-200/70"
            title="The human experience layer: standing creative rules every agent obeys"
          >
            playbook
          </button>
        </div>
      </div>

      {showCustom && (
        <div className="term-border flex flex-wrap items-end gap-2 rounded bg-[#091009] p-3">
          <input
            placeholder="Client"
            value={custom.client}
            onChange={(e) => setCustom({ ...custom, client: e.target.value })}
            className="mono w-40 rounded border border-green-500/30 bg-black/40 px-2 py-1.5 text-[12px] text-green-100 outline-none focus:border-green-400"
          />
          <input
            placeholder="Order title, e.g. 5s vertical bumper for ..."
            value={custom.title}
            onChange={(e) => setCustom({ ...custom, title: e.target.value })}
            className="mono w-80 rounded border border-green-500/30 bg-black/40 px-2 py-1.5 text-[12px] text-green-100 outline-none focus:border-green-400"
          />
          <input
            placeholder="Brief: audience, feel, what to end on"
            value={custom.brief}
            onChange={(e) => setCustom({ ...custom, brief: e.target.value })}
            className="mono min-w-[280px] flex-1 rounded border border-green-500/30 bg-black/40 px-2 py-1.5 text-[12px] text-green-100 outline-none focus:border-green-400"
          />
          <input
            type="number"
            value={custom.amountUsd}
            onChange={(e) => setCustom({ ...custom, amountUsd: Number(e.target.value) })}
            className="mono w-24 rounded border border-green-500/30 bg-black/40 px-2 py-1.5 text-[12px] text-green-100 outline-none focus:border-green-400"
          />
          <button
            onClick={() => {
              post('/api/orders', custom)
              setShowCustom(false)
            }}
            className="mono rounded bg-green-500/20 px-4 py-1.5 text-[12px] font-medium text-green-300 hover:bg-green-500/30"
          >
            LOCK ESCROW
          </button>
        </div>
      )}

      {showPlaybook && (
        <div className="term-border rounded bg-[#091009] p-3">
          <div className="mono mb-1 text-[11px] uppercase tracking-widest text-green-200/60">
            {'>'}_ CEO playbook. The human experience layer, injected into every agent prompt.
          </div>
          <textarea
            value={playbookDraft ?? state.playbook}
            onChange={(e) => setPlaybookDraft(e.target.value)}
            rows={6}
            className="mono w-full rounded border border-green-500/30 bg-black/40 p-2 text-[12px] leading-relaxed text-green-100 outline-none focus:border-green-400"
          />
          <button
            onClick={() => {
              post('/api/playbook', { playbook: playbookDraft })
              setShowPlaybook(false)
            }}
            className="mono mt-1 rounded bg-green-500/20 px-4 py-1.5 text-[12px] font-medium text-green-300 hover:bg-green-500/30"
          >
            SAVE PLAYBOOK
          </button>
        </div>
      )}

      {/* pipeline board */}
      <div className="grid grid-cols-6 gap-2" style={{ minHeight: 150 }}>
        {COLUMNS.map((col) => {
          const orders = state.orders.filter(col.match)
          return (
            <div key={col.key} className="term-border flex flex-col rounded bg-[#080e09] p-2">
              <div className="mono mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-widest text-green-300/80">
                {col.title}
                <span className="text-green-200/40">{orders.length}</span>
              </div>
              <div className="flex max-h-[190px] flex-col gap-1.5 overflow-y-auto">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      setSelectedId(o.id)
                      setViewAgent(null)
                    }}
                    className={
                      'card-hover rounded border p-2 text-left ' +
                      (selectedId === o.id
                        ? 'border-green-400/80 bg-green-500/10'
                        : 'border-green-500/15 bg-black/30')
                    }
                  >
                    <div className="mono truncate text-[11px] text-green-100">{o.title}</div>
                    <div className="mono mt-0.5 flex items-center justify-between text-[10px] text-green-200/50">
                      <span className="truncate">{o.client}</span>
                      <span className="text-green-300">${o.amountUsd}</span>
                    </div>
                    {o.status === 'producing' && (
                      <div className="mt-1">
                        <div className="h-1.5 overflow-hidden rounded bg-green-500/10">
                          <div
                            className="h-full bg-emerald-400/70 transition-all"
                            style={{ width: `${o.videoProgress ?? 2}%` }}
                          />
                        </div>
                        <div className="mono mt-0.5 text-[9px] text-emerald-300/80">
                          render {o.videoProgress ?? 0}%
                        </div>
                      </div>
                    )}
                    {(o.status === 'concepting' || o.status === 'jury' || o.status === 'revising') && (
                      <div className="dot-working mono mt-1 text-[9px] text-amber-300/80">
                        {o.status === 'jury' ? 'duels in progress' : 'concepting'}
                      </div>
                    )}
                    {o.revision > 0 && o.status !== 'delivered' && (
                      <div className="mono mt-0.5 text-[9px] text-orange-300/70">rev {o.revision}</div>
                    )}
                    {o.status === 'delivered' && o.invoice && (
                      <div className="mono mt-0.5 text-[9px] text-green-400/70">{o.invoice.id} paid</div>
                    )}
                  </button>
                ))}
                {orders.length === 0 && (
                  <div className="mono py-3 text-center text-[10px] text-green-200/25">empty</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* shipped reel */}
      {shipped.length > 0 && (
        <div className="term-border rounded bg-[#080e09] p-2">
          <div className="mono mb-1.5 text-[10px] font-medium uppercase tracking-widest text-green-300/80">
            {'>'}_ shipped reel. Footage delivered and paid for.
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {shipped.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className="card-hover shrink-0 rounded border border-green-500/20"
                title={o.title}
              >
                <video
                  src={o.videoFile}
                  muted
                  loop
                  autoPlay
                  playsInline
                  className="h-40 rounded"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* bottom: feed + detail */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.7fr] gap-2">
        {/* live feed */}
        <div className="term-border flex min-h-0 flex-col rounded bg-[#080e09] p-2">
          <div className="mono mb-1 text-[10px] font-medium uppercase tracking-widest text-green-300/80">
            {'>'}_ live company feed
          </div>
          <div className="mono min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug">
            {state.events.map((e, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="shrink-0 text-green-200/35">{fmtTime(e.t)}</span>
                <span className={'shrink-0 ' + (TAG_COLOR[e.tag] ?? 'text-green-300')}>
                  [{e.tag}]
                </span>
                <span className={i === 0 ? 'text-green-100' : 'text-green-200/70'}>{e.text}</span>
              </div>
            ))}
            {state.events.length === 0 && (
              <div className="text-green-200/30">
                Company is quiet. Lock a brief into escrow to wake the studio.
              </div>
            )}
          </div>
        </div>

        {/* detail panel */}
        <div className="term-border flex min-h-0 flex-col rounded bg-[#080e09] p-3">
          {!selected ? (
            <div className="mono m-auto text-[12px] text-green-200/30">
              select an order card to inspect
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="mono text-[14px] text-green-100">{selected.title}</div>
                  <div className="mono text-[11px] text-green-200/50">
                    {selected.client} / ${selected.amountUsd} in escrow / status{' '}
                    <span className="text-green-300">{selected.status}</span>
                    {selected.revision > 0 && ` / rev ${selected.revision}`}
                  </div>
                </div>
                {selected.status === 'review' && (
                  <button
                    onClick={() => post('/api/review', { orderId: selected.id, action: 'approve' })}
                    className="mono shrink-0 rounded bg-green-500/25 px-4 py-2 text-[12px] font-medium text-green-200 hover:bg-green-500/40"
                  >
                    ACCEPT / RELEASE ESCROW
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="mono mb-2 rounded border border-green-500/15 bg-black/30 p-2 text-[11px] text-green-200/70">
                  {selected.brief}
                </div>

                {(selected.status === 'concepting' || selected.status === 'inbox') && (
                  <div className="grid grid-cols-3 gap-2">
                    {agents.map((a) => (
                      <div key={a.id} className="term-border rounded p-2">
                        <div className="mono text-[11px] text-green-100">
                          [{a.tag}] {a.name}
                        </div>
                        <div className="dot-working mono mt-1 text-[10px] text-amber-300/70">
                          concepting
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selected.duels.length > 0 && (
                  <div className="mb-2">
                    <div className="mono mb-1 text-[10px] font-medium uppercase tracking-widest text-green-300/80">
                      {'>'}_ jury: {selected.duels.length} duels, Bradley-Terry aggregate
                    </div>
                    {selected.ranking.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {selected.ranking.map((r, idx) => {
                          const a = agentOf(r.agentId)
                          return (
                            <div key={r.agentId} className="flex items-center gap-2">
                              <span className="mono w-32 shrink-0 text-[11px] text-green-100">
                                {idx === 0 ? '* ' : '  '}[{a?.tag}] {a?.name}
                              </span>
                              <div className="h-3 flex-1 overflow-hidden rounded bg-green-500/10">
                                <div
                                  className={
                                    'h-full ' + (idx === 0 ? 'bg-green-400/80' : 'bg-green-500/30')
                                  }
                                  style={{ width: `${Math.max(4, r.score * 100)}%` }}
                                />
                              </div>
                              <span className="mono w-20 shrink-0 text-right text-[10px] text-green-200/60">
                                {(r.score * 100).toFixed(0)}% / {r.wins}W
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {selected.duels.map((d, i) => (
                        <div key={i} className="mono text-[10px] text-green-200/55">
                          {agentOf(d.a)?.name} vs {agentOf(d.b)?.name} / {d.judge} -&gt;{' '}
                          <span className="text-green-300">{agentOf(d.winner)?.name}</span>: {d.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* production + review area */}
                {(selected.status === 'producing' ||
                  selected.status === 'review' ||
                  selected.status === 'delivered' ||
                  selected.status === 'revising') &&
                  selected.drafts.length > 0 && (
                    <div className="flex gap-3">
                      {/* video side */}
                      <div className="w-[228px] shrink-0">
                        {selected.videoFile ? (
                          <video
                            src={selected.videoFile}
                            controls
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="w-full rounded border border-green-500/25"
                          />
                        ) : selected.status === 'producing' ? (
                          <div className="term-border flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded p-3">
                            <div className="mono text-[11px] uppercase tracking-widest text-emerald-300">
                              studio rendering
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded bg-green-500/10">
                              <div
                                className="h-full bg-emerald-400/70 transition-all"
                                style={{ width: `${selected.videoProgress ?? 2}%` }}
                              />
                            </div>
                            <div className="mono text-[18px] text-green-100">
                              {selected.videoProgress ?? 0}%
                            </div>
                            <div className="mono text-center text-[9px] text-green-200/40">
                              Seedance 2.0 / 5s / 9:16
                            </div>
                          </div>
                        ) : (
                          <div className="term-border flex aspect-[9/16] w-full items-center justify-center rounded p-3">
                            <div className="mono text-center text-[10px] text-amber-300/80">
                              {selected.videoNote ?? 'no footage yet'}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* concept side */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-1">
                          {selected.drafts.map((d) => {
                            const a = agentOf(d.agentId)
                            const active = (viewAgent ?? selected.winnerAgentId) === d.agentId
                            return (
                              <button
                                key={d.agentId}
                                onClick={() => setViewAgent(d.agentId)}
                                className={
                                  'mono rounded px-2 py-1 text-[10px] ' +
                                  (active
                                    ? 'bg-green-500/25 text-green-100'
                                    : 'text-green-200/50 hover:bg-green-500/10')
                                }
                              >
                                [{a?.tag}] {a?.name}
                                {selected.winnerAgentId === d.agentId ? ' *' : ''}
                                {d.revised ? ' r' : ''}
                              </button>
                            )
                          })}
                        </div>
                        {(() => {
                          const d =
                            selected.drafts.find(
                              (x) => x.agentId === (viewAgent ?? selected.winnerAgentId),
                            ) ?? selected.drafts[0]
                          const c = d.concept
                          return (
                            <div className="space-y-2 rounded border border-green-500/15 bg-black/30 p-3">
                              <div>
                                <div className="mono text-[10px] uppercase tracking-widest text-green-200/40">
                                  concept
                                </div>
                                <div className="mono text-[14px] text-green-100">{c.concept}</div>
                              </div>
                              <div>
                                <div className="mono text-[10px] uppercase tracking-widest text-green-200/40">
                                  hook
                                </div>
                                <div className="text-[12px] text-green-50/90">{c.hook}</div>
                              </div>
                              <div>
                                <div className="mono text-[10px] uppercase tracking-widest text-green-200/40">
                                  beats
                                </div>
                                <ol className="mt-0.5 space-y-0.5">
                                  {c.beats.map((b, i) => (
                                    <li key={i} className="mono text-[11px] text-green-200/80">
                                      {i + 1}. {b}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                              <div>
                                <div className="mono text-[10px] uppercase tracking-widest text-green-200/40">
                                  style
                                </div>
                                <div className="text-[12px] text-green-50/90">{c.style}</div>
                              </div>
                              <div>
                                <div className="mono text-[10px] uppercase tracking-widest text-green-200/40">
                                  render prompt
                                </div>
                                <div className="mono text-[10.5px] leading-relaxed text-green-200/60">
                                  {c.video_prompt}
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )}

                {selected.status === 'review' && (
                  <div className="mt-2 flex gap-2">
                    <input
                      placeholder="CEO notes, e.g. hook is weak, go darker, end tighter on the product"
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="mono flex-1 rounded border border-green-500/30 bg-black/40 px-2 py-1.5 text-[11px] text-green-100 outline-none focus:border-green-400"
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
                      className="mono rounded bg-orange-500/20 px-3 py-1.5 text-[11px] font-medium text-orange-200 hover:bg-orange-500/30"
                    >
                      SEND BACK
                    </button>
                  </div>
                )}

                {selected.status === 'delivered' && selected.invoice && (
                  <div className="term-border mt-2 rounded bg-green-500/5 p-2">
                    <div className="mono text-[11px] font-medium text-green-300">
                      {selected.invoice.id} / ${selected.amountUsd} settled / {fmtTime(selected.invoice.paidAt)}
                    </div>
                    <div className="mono mt-0.5 break-all text-[10px] text-green-200/50">
                      {selected.invoice.ref}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="mono flex items-center justify-between text-[10px] text-green-200/35">
        <span>
          OPC formula, implemented: Human Experience (Playbook) + AI Loop (concepts, jury, render) +
          Human Review (Acceptance Gate releases escrow)
        </span>
        <span>
          Jury: pairwise duels + Bradley-Terry, the mechanism behind GG24 Deep Funding L3 rank 1 /
          BUIDL_OPC_Hackathon_SG 2026-07-12
        </span>
      </div>
    </div>
  )
}
