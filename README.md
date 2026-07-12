# SoloCorp OS

**1 human × N agents = a company.**
The operating system for One-Person Companies: AI agents do the work, an AI jury ranks it, the human CEO's acceptance is the switch that releases payment.

Built solo in one day at **BUIDL_OPC_Hackathon_SG** (Singapore, 2026-07-12).

## The OPC formula, implemented literally

The hackathon theme is `OPC = Human's Experience + AI's Loop + Human's Review`. SoloCorp OS maps each term to a concrete mechanism:

| Theme term | Mechanism in SoloCorp OS |
|---|---|
| **Human's Experience** | The **CEO Playbook** — the founder's professional standards, injected into every agent prompt. Edit it live; the whole workforce changes behaviour. |
| **AI's Loop** | Order → 3 worker agents draft in parallel → **AI Jury runs pairwise duels, Bradley-Terry aggregates a ranking** → top draft advances. Rejected work loops back with feedback. |
| **Human's Review** | The **Acceptance Gate**. Client budget sits in escrow from order creation; the CEO's one click of "Accept" is what releases settlement. Human judgment is the payment switch, not a rubber stamp. |

## Why the jury matters (the part nobody else has)

Most agent demos pick "the best" output with a single LLM call and vibes. SoloCorp OS ranks candidate deliverables the way competition juries actually work:

1. Every pair of drafts is compared head-to-head by independent Claude judges with different criteria (factual rigor vs. decision-usefulness for the paying client).
2. Verdicts are aggregated with **Bradley-Terry maximum likelihood** into a global quality ranking.

This is the exact mechanism the founder used to take **#1 on GG24 Deep Funding Level 3** (Ethereum Foundation / Gitcoin, LLM-jury-judged competition). It is battle-tested against real human jury ground truth, and here it becomes the quality-control layer of a one-person company.

## Architecture

```
client order ($ locked in escrow)
        │
        ▼
┌─ AI's Loop ────────────────────────────────────────────┐
│  🧭 Atlas      🕶️ Nova       📐 Quant                  │
│  (structured)  (contrarian)  (data-first)               │
│      └─────────── 3 parallel drafts ──────────┐         │
│                                               ▼         │
│  ⚖️ AI Jury: 3 pairwise duels × 2 Claude judges         │
│     → Bradley-Terry MLE → ranked drafts                 │
└──────────────────────────────┬──────────────────────────┘
                               ▼
              👤 CEO Acceptance Gate (human review)
              ├─ Reject + feedback ──▶ revision loop ↺
              └─ Accept ──▶ escrow released, invoice issued,
                            treasury +$, agent reputation +
```

- **Workers**: OpenAI `gpt-5.4-mini` (fast drafting)
- **Jury**: Anthropic `claude-sonnet-5` (adversarial pairwise judging)
- **Resilience**: every LLM output is disk-cached; if the venue network dies, the pipeline replays at human pace instead of failing
- **Stack**: Next.js 16 + React 19 + Tailwind 4, single process, zero external services

## Run it

```bash
cd app
npm install
# .env.local:
#   OPENAI_API_KEY=sk-...
#   OPENROUTER_API_KEY=sk-or-...   (jury calls Claude via OpenRouter)
npm run dev
# open http://localhost:3000, click a template order, watch the company work
```

## Demo script (90 seconds)

1. Click **+ Meridian Capital · $250** — an order locks into escrow, three agents start typing.
2. Watch the live feed: drafts land, the jury convenes, duel verdicts stream in with one-line reasons.
3. Bradley-Terry bars rank the drafts; the winner hits the **CEO Gate**.
4. Type feedback, hit **Send back** — the winning agent revises (the loop closes).
5. Hit **Accept — release escrow** — invoice issued, treasury ticks up, reputation accrues.

## Roadmap (post-hackathon)

- **Real settlement**: x402 / USDC on Base — the founder's Port-USDC repo already implements agent entry fees and on-chain payroll; wiring it into the Acceptance Gate is a weekend, not a research project.
- **ASP listing**: package the company as an Agent Service Provider in emerging A2A marketplaces (okx.ai-style escrow + acceptance flows map 1:1 to this design).
- **AWS deploy**: Bedrock for inference + Lambda for the pipeline; the $ credits this hackathon awards are literally this product's COGS.
- **Action-guarded autonomy**: risk-graded approvals (auto-approve low-stakes, human-gate irreversible) per Microsoft Magentic-UI's action-guard pattern.

## Honest limitations

- Settlement is simulated (deterministic tx hash, labelled as such in the UI) — the on-chain path is roadmap, not shipped.
- Agent reputation is a local counter, not portable identity.
- One vertical (research deliverables) is wired end-to-end; other service types are prompt changes away but undemonstrated.

---

*BUIDL_QUESTS 2026 track: 05 OPC / Super Individuals (primary), 01 Autonomous Agents (secondary).*
