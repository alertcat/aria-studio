# SoloCorp OS — Pitch reference

## 30-second booth pitch (Top 30 screening)

> Everyone here built agents that do work. The hard problem is different: **when an agent works for money, who decides the work is good enough to get paid?**
>
> SoloCorp OS is the operating system for a one-person company. Client budget locks into escrow. Three agents draft in parallel. Then an AI jury runs **pairwise duels and aggregates them with Bradley-Terry** — the same mechanism that won me #1 in Ethereum Foundation's Deep Funding contest, where LLM juries were scored against real human juries.
>
> The top draft lands on my desk. My one click of "Accept" is the switch that releases the money. That's the OPC formula, literally: my experience is the Playbook every agent obeys, the loop is draft→jury→revise, and my review is the settlement trigger.
>
> [Click Accept. Treasury ticks up.] One human, three agents, a company that already invoices.

## 3-minute pitch (if Top 10)

### 1 — Problem (30s)
A one-person company is not "a person with a chatbot". It is a person whose **quality bar and judgment** get multiplied by agents that work while they sleep. Two things are missing from every agent framework today: a **trustworthy quality-control layer** (not "the LLM said it's good"), and a **commercial closure** — the moment where human acceptance releases payment. Without those, agents produce drafts, not revenue.

### 2 — Mechanism (60s)
SoloCorp OS wires the full loop:

- Order intake locks the client's budget **in escrow**.
- Three worker agents with different cognitive styles (structured / contrarian / data-first) draft in parallel. Every prompt carries the **CEO Playbook** — my professional standards, editable live. That's the human experience layer.
- The **AI Jury**: every pair of drafts is judged head-to-head by independent Claude judges with different criteria, and verdicts aggregate via **Bradley-Terry MLE** into a ranking. Pairwise-then-aggregate is how real competition juries work — I know because this exact stack took **#1 on GG24 Deep Funding L3**, judged against hidden human jury ground truth. Single-shot "rate this 1-10" scoring does not survive contact with real juries; pairwise duels do.
- The winner hits my **Acceptance Gate**. Reject sends it back with feedback — the loop closes. Accept **releases escrow**: invoice, treasury, agent reputation.

### 3 — Live demo (60s)
[Fire a fresh order. Feed streams: drafts → duel verdicts with one-line reasons → BT bars → CEO Gate. Send one back with feedback, show the revision. Accept. Invoice + treasury.]

### 4 — Why now, why me (30s)
Agent-to-agent commerce is being built right now — x402 payments, okx.ai's escrow-and-acceptance marketplace launched two weeks ago. Their flow is exactly this: escrow → deliver → **human acceptance releases funds**. SoloCorp OS is the operating layer a solo builder needs to sell into that economy. I've already shipped on-chain agent payroll (Port-USDC, Base Sepolia) — real settlement is a weekend of wiring, and the AWS credits from today are literally this product's inference budget.

## Q&A prep

- **"Isn't the jury just more LLM calls?"** — It's structurally different: independent judges, adversarial pairwise framing, and an MLE aggregation with known statistical properties. Validated competitively against human jury ground truth (Deep Funding L3 #1).
- **"Why three agents instead of one good one?"** — Diversity is what makes the jury informative. Three styles explore the answer space; the jury exploits it. Marginal cost of a draft: ~$0.01.
- **"What if the client disputes?"** — Roadmap: okx.ai-style arbitration (staked third-party voters). The escrow primitive already anticipates it.
- **"Why simulated settlement?"** — Honesty over theater: the tx hash is labelled simulated. The x402/USDC path exists in my Port-USDC repo; it's integration work, not invention.
- **"What's defensible?"** — The jury layer is a quality moat that compounds: every duel verdict is training signal about *my* quality bar. The Playbook + duel history becomes a proprietary dataset of one person's taste — exactly the asset an OPC monetises.

## One-liners to land

- "My click is the payment switch."
- "The jury that won an Ethereum Foundation contest now runs my QA."
- "Agents draft. Juries rank. Humans accept. Money moves."
