'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ---------- types mirrored from the server ----------
type Agent = {
  id: string
  name: string
  role: string
  emoji: string
  feeUsd: number
  reputation: number
  delivered: number
  status: 'idle' | 'working'
}
type Draft = { agentId: string; content: string; cached: boolean; revised?: boolean }
type Duel = { a: string; b: string; winner: string; judge: string; reason: string }
type RankEntry = { agentId: string; score: number; wins: number }
type Order = {
  id: string
  client: string
  title: string
  brief: string
  amountUsd: number
  status: 'inbox' | 'drafting' | 'jury' | 'review' | 'revising' | 'delivered'
  createdAt: number
  revision: number
  drafts: Draft[]
  duels: Duel[]
  ranking: RankEntry[]
  winnerAgentId?: string
  invoice?: { id: string; paidAt: number; tx: string }
  error?: string
}
type Ev = { t: number; icon: string; text: string; orderId?: string }
type ApiState = {
  company: { name: string; ceo: string; vertical: string }
  state: { orders: Order[]; events: Ev[]; revenue: number; delivered: number; playbook: string }
  agents: Agent[]
  judges: string[]
  templates: { client: string; title: string; brief: string; amountUsd: number }[]
}

const COLUMNS: { key: string; title: string; match: (o: Order) => boolean }[] = [
  { key: 'inbox', title: '📥 INBOX', match: (o) => o.status === 'inbox' },
  {
    key: 'drafting',
    title: '🤖 AGENTS DRAFTING',
    match: (o) => o.status === 'drafting' || o.status === 'revising',
  },
  { key: 'jury', title: '⚖️ AI JURY', match: (o) => o.status === 'jury' },
  { key: 'review', title: '👤 CEO GATE', match: (o) => o.status === 'review' },
  { key: 'delivered', title: '✅ DELIVERED', match: (o) => o.status === 'delivered' },
]

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
  const [custom, setCustom] = useState({ client: '', title: '', brief: '', amountUsd: 150 })
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' })
      const json: ApiState = await res.json()
      setData(json)
      if (!selectedRef.current && json.state.orders.length > 0) {
        const hot =
          json.state.orders.find((o) => o.status === 'review') ?? json.state.orders[0]
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
        <div className="mono text-green-400 cursor-blink glow">BOOTING SOLOCORP_OS </div>
      </div>
    )
  }

  const { state, agents, templates, company } = data
  const selected = state.orders.find((o) => o.id === selectedId) ?? null
  const agentOf = (id: string) => agents.find((a) => a.id === id)
  const workingCount = agents.filter((a) => a.status === 'working').length

  const tickerItems = [
    `TREASURY $${state.revenue.toLocaleString()}`,
    `${state.delivered} DELIVERED`,
    `${state.orders.filter((o) => o.status !== 'delivered').length} IN PIPELINE`,
    workingCount ? `${workingCount} AGENT${workingCount > 1 ? 'S' : ''} WORKING` : 'AGENTS IDLE',
    'ESCROW READY',
    'JURY: 2× CLAUDE JUDGES LIVE',
    'HUMAN GATE: CEO ONLINE',
    'x402-READY SETTLEMENT',
  ]

  return (
    <div className="mx-auto flex h-screen max-w-[1600px] flex-col gap-3 p-3">
      {/* ticker */}
      <div className="term-border-solid mono flex items-center gap-2 overflow-hidden rounded bg-[#0a120c] px-3 py-1 text-[11px] text-green-500/90">
        <span className="dot-working inline-block h-2 w-2 rounded-full bg-green-400" />
        <div className="flex gap-6 whitespace-nowrap">
          {tickerItems.map((it, i) => (
            <span key={i}>
              {it} <span className="text-green-800">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="mono text-2xl font-bold tracking-tight text-green-400 glow">
            [SOLOCORP_OS]
          </h1>
          <p className="mono text-[12px] text-green-200/60">
            1 human × {agents.length} agents = a company · {company.vertical}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="mono text-[10px] uppercase text-green-200/50">Treasury</div>
            <div className="mono text-2xl font-bold text-green-400 glow">
              ${state.revenue.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-[10px] uppercase text-green-200/50">Delivered</div>
            <div className="mono text-2xl font-bold text-green-100">{state.delivered}</div>
          </div>
          <div className="term-border rounded px-3 py-1.5">
            <div className="mono text-[10px] uppercase text-green-200/50">CEO · human gate</div>
            <div className="mono text-sm text-green-100">👤 {company.ceo}</div>
          </div>
        </div>
      </div>

      {/* roster + commands */}
      <div className="flex flex-wrap items-stretch gap-2">
        {agents.map((a) => (
          <div key={a.id} className="term-border flex min-w-[190px] items-center gap-2 rounded bg-[#091009] px-3 py-2">
            <span className="text-xl">{a.emoji}</span>
            <div className="flex-1">
              <div className="mono text-[13px] font-semibold text-green-100">
                {a.name}
                <span className="ml-1 text-[10px] font-normal text-green-200/50">{a.role}</span>
              </div>
              <div className="mono text-[10px] text-green-200/60">
                rep {a.reputation} · {a.delivered} shipped · ${a.feeUsd}/task
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
        <div className="term-border flex min-w-[190px] items-center gap-2 rounded bg-[#091009] px-3 py-2">
          <span className="text-xl">⚖️</span>
          <div>
            <div className="mono text-[13px] font-semibold text-green-100">AI Jury</div>
            <div className="mono text-[10px] text-green-200/60">
              pairwise duels → Bradley-Terry · claude-sonnet-5
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
              + {t.client} · ${t.amountUsd}
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
            title="The human experience layer: standing instructions every agent obeys"
          >
            📘 playbook
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
            placeholder="Order title"
            value={custom.title}
            onChange={(e) => setCustom({ ...custom, title: e.target.value })}
            className="mono w-72 rounded border border-green-500/30 bg-black/40 px-2 py-1.5 text-[12px] text-green-100 outline-none focus:border-green-400"
          />
          <input
            placeholder="Brief"
            value={custom.brief}
            onChange={(e) => setCustom({ ...custom, brief: e.target.value })}
            className="mono min-w-[300px] flex-1 rounded border border-green-500/30 bg-black/40 px-2 py-1.5 text-[12px] text-green-100 outline-none focus:border-green-400"
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
            className="mono rounded bg-green-500/20 px-4 py-1.5 text-[12px] font-semibold text-green-300 hover:bg-green-500/30"
          >
            LOCK ESCROW →
          </button>
        </div>
      )}

      {showPlaybook && (
        <div className="term-border rounded bg-[#091009] p-3">
          <div className="mono mb-1 text-[11px] uppercase text-green-200/60">
            CEO Playbook — the human&apos;s experience, injected into every agent prompt
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
            className="mono mt-1 rounded bg-green-500/20 px-4 py-1.5 text-[12px] font-semibold text-green-300 hover:bg-green-500/30"
          >
            SAVE PLAYBOOK
          </button>
        </div>
      )}

      {/* pipeline board */}
      <div className="grid grid-cols-5 gap-2" style={{ minHeight: 170 }}>
        {COLUMNS.map((col) => {
          const orders = state.orders.filter(col.match)
          return (
            <div key={col.key} className="term-border flex flex-col rounded bg-[#080e09] p-2">
              <div className="mono mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-green-300/80">
                {col.title}
                <span className="text-green-200/40">{orders.length}</span>
              </div>
              <div className="flex max-h-[210px] flex-col gap-1.5 overflow-y-auto">
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
                    <div className="mono truncate text-[11px] font-medium text-green-100">
                      {o.title}
                    </div>
                    <div className="mono mt-0.5 flex items-center justify-between text-[10px] text-green-200/50">
                      <span className="truncate">{o.client}</span>
                      <span className="font-semibold text-green-300">${o.amountUsd}</span>
                    </div>
                    {(o.status === 'drafting' || o.status === 'jury' || o.status === 'revising') && (
                      <div className="mono mt-1 text-[9px] text-amber-300/80 dot-working">
                        ● {o.status === 'jury' ? 'duels in progress' : 'agents typing…'}
                      </div>
                    )}
                    {o.revision > 0 && o.status !== 'delivered' && (
                      <div className="mono mt-0.5 text-[9px] text-orange-300/70">rev {o.revision}</div>
                    )}
                    {o.status === 'delivered' && o.invoice && (
                      <div className="mono mt-0.5 text-[9px] text-green-400/70">{o.invoice.id} ✓ paid</div>
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

      {/* bottom: feed + detail */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.6fr] gap-2">
        {/* live feed */}
        <div className="term-border flex min-h-0 flex-col rounded bg-[#080e09] p-2">
          <div className="mono mb-1 text-[11px] font-semibold uppercase tracking-wide text-green-300/80">
            ▸ Live company feed
          </div>
          <div className="mono min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug">
            {state.events.map((e, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="shrink-0 text-green-200/35">{fmtTime(e.t)}</span>
                <span className="shrink-0">{e.icon}</span>
                <span className={i === 0 ? 'text-green-100' : 'text-green-200/70'}>{e.text}</span>
              </div>
            ))}
            {state.events.length === 0 && (
              <div className="text-green-200/30">Company is quiet. Lock an order into escrow to wake the agents.</div>
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
                  <div className="mono text-[14px] font-semibold text-green-100">{selected.title}</div>
                  <div className="mono text-[11px] text-green-200/50">
                    {selected.client} · ${selected.amountUsd} in escrow · status:{' '}
                    <span className="text-green-300">{selected.status}</span>
                    {selected.revision > 0 && ` · rev ${selected.revision}`}
                  </div>
                </div>
                {selected.status === 'review' && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => post('/api/review', { orderId: selected.id, action: 'approve' })}
                      className="mono rounded bg-green-500/25 px-4 py-2 text-[12px] font-bold text-green-200 hover:bg-green-500/40"
                    >
                      ✅ ACCEPT — RELEASE ESCROW
                    </button>
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {/* brief */}
                <div className="mono mb-2 rounded border border-green-500/15 bg-black/30 p-2 text-[11px] text-green-200/70">
                  {selected.brief}
                </div>

                {/* drafting skeletons */}
                {(selected.status === 'drafting' || selected.status === 'inbox') && (
                  <div className="grid grid-cols-3 gap-2">
                    {agents.map((a) => (
                      <div key={a.id} className="term-border rounded p-2">
                        <div className="mono text-[11px] text-green-100">
                          {a.emoji} {a.name}
                        </div>
                        <div className="mono mt-1 text-[10px] text-amber-300/70 dot-working">
                          ● drafting…
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* jury + ranking */}
                {selected.duels.length > 0 && (
                  <div className="mb-2">
                    <div className="mono mb-1 text-[11px] font-semibold uppercase text-green-300/80">
                      ⚔️ Jury duels ({selected.duels.length}) → Bradley-Terry
                    </div>
                    {selected.ranking.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {selected.ranking.map((r, idx) => {
                          const a = agentOf(r.agentId)
                          return (
                            <div key={r.agentId} className="flex items-center gap-2">
                              <span className="mono w-28 shrink-0 text-[11px] text-green-100">
                                {idx === 0 ? '👑 ' : ''}
                                {a?.emoji} {a?.name}
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
                                {(r.score * 100).toFixed(0)}% · {r.wins}W
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {selected.duels.map((d, i) => (
                        <div key={i} className="mono text-[10px] text-green-200/55">
                          {agentOf(d.a)?.name} vs {agentOf(d.b)?.name} · {d.judge} →{' '}
                          <span className="text-green-300">{agentOf(d.winner)?.name}</span>: “{d.reason}”
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* deliverable viewer */}
                {selected.drafts.length > 0 && selected.status !== 'jury' && (
                  <div>
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
                            {a?.emoji} {a?.name}
                            {selected.winnerAgentId === d.agentId ? ' 👑' : ''}
                            {d.revised ? ' ↻' : ''}
                          </button>
                        )
                      })}
                    </div>
                    <div className="deliverable rounded border border-green-500/15 bg-black/30 p-3 text-[12.5px] text-green-50/90">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {
                          (
                            selected.drafts.find(
                              (d) => d.agentId === (viewAgent ?? selected.winnerAgentId),
                            ) ?? selected.drafts[0]
                          ).content
                        }
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* revise box */}
                {selected.status === 'review' && (
                  <div className="mt-2 flex gap-2">
                    <input
                      placeholder="CEO feedback… e.g. quantify the downside case, add a 90-day action plan"
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
                      className="mono rounded bg-orange-500/20 px-3 py-1.5 text-[11px] font-semibold text-orange-200 hover:bg-orange-500/30"
                    >
                      ↩ SEND BACK
                    </button>
                  </div>
                )}

                {/* invoice */}
                {selected.status === 'delivered' && selected.invoice && (
                  <div className="term-border mt-2 rounded bg-green-500/5 p-2">
                    <div className="mono text-[11px] font-semibold text-green-300">
                      💸 {selected.invoice.id} — ${selected.amountUsd} settled ·{' '}
                      {fmtTime(selected.invoice.paidAt)}
                    </div>
                    <div className="mono mt-0.5 break-all text-[10px] text-green-200/50">
                      {selected.invoice.tx}
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
          OPC formula: Human&apos;s Experience (Playbook) + AI&apos;s Loop (agents × jury) + Human&apos;s
          Review (Acceptance Gate = escrow release)
        </span>
        <span>
          Jury mechanism: pairwise LLM duels + Bradley-Terry — same method that won GG24 Deep Funding
          L3 #1 · BUIDL_OPC_Hackathon_SG 2026-07-12
        </span>
      </div>
    </div>
  )
}
