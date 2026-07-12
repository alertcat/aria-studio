# SoloCorp OS

**1 human x 3 agents = an ad studio.**
Agents concept, an AI jury ranks the concepts through pairwise duels, a video model renders the winning cut, and the human CEO's acceptance is the switch that releases payment. Real briefs in, real footage out, real invoices.

Built solo in one day at **BUIDL_OPC_Hackathon_SG** (Singapore, 2026-07-12).

## What problem this solves

A 5-second vertical bumper ad costs an SMB hundreds to thousands of dollars and days of agency turnaround. Text-to-video models made the render cheap, but a render button is not a business: clients need concept development, quality control, revisions, and a commercial loop where payment follows acceptance. That workflow layer is what a one-person studio actually sells. SoloCorp OS is that layer, run by agents, gated by a human.

The deliverable is not a wall of text. It is a watchable, shippable video file.

## The OPC formula, implemented literally

The hackathon theme is `OPC = Human's Experience + AI's Loop + Human's Review`. Each term maps to a concrete mechanism:

| Theme term | Mechanism in SoloCorp OS |
|---|---|
| Human's Experience | The **CEO Playbook**: the founder's creative standards (hook in half a second, one idea per ad, end on the product), injected into every agent prompt. Edit it live and the whole studio changes behaviour. |
| AI's Loop | Brief -> 3 director agents pitch concepts in parallel -> **AI jury runs pairwise duels, Bradley-Terry aggregates a ranking** -> winning concept goes to the render pipeline -> rejected cuts loop back with CEO notes. |
| Human's Review | The **Acceptance Gate**. Client budget locks into escrow at order time; the CEO's click of Accept is what releases settlement. Human judgment is the payment switch, not a rubber stamp. |

## Why the jury matters

Picking "the best" output with a single LLM call is vibes. SoloCorp OS ranks candidate concepts the way competition juries actually work:

1. Every pair of concepts is compared head-to-head by independent Claude judges with different criteria (brand fit vs scroll-stopping power).
2. Verdicts aggregate with **Bradley-Terry maximum likelihood** into a global ranking.

This is the same mechanism the founder used to take **rank 1 on GG24 Deep Funding Level 3** (Ethereum Foundation / Gitcoin), where LLM jury pipelines were scored against hidden human jury ground truth. Here it has a second job: it spends cents on text duels so the studio never burns render dollars on a weak concept.

## Architecture

```
client brief ($ locked in escrow)
        |
        v
+- AI's Loop ------------------------------------------------+
|  VT VOLT          SB SABLE          PX PIXEL               |
|  hype director    cinematic         playful                |
|      +--------- 3 concept pitches (JSON) ---------+        |
|                                                   v        |
|  jury: 3 pairwise duels x 2 Claude judges                  |
|        -> Bradley-Terry MLE -> winning concept             |
|                                                   v        |
|  studio: Seedance 2.0 text-to-video render (5s, 9:16)      |
+------------------------------+------------------------------+
                               v
              CEO Acceptance Gate (human review)
              +- send back with notes -> revised concept, re-render
              +- accept -> escrow released, invoice issued,
                           treasury +$, agent reputation +
```

- Directors: OpenAI `gpt-5.4-mini` (fast structured concepting)
- Jury: `claude-sonnet-5`, served from the founder's own relay (relayrouter.io), OpenRouter fallback
- Render: Seedance 2.0 via RelayDance (`doubao-seedance-2-0-fast`), 5s vertical, about 150s per cut
- Resilience: every LLM and render output is disk-cached; if the venue network dies the pipeline replays at human pace instead of failing
- Stack: Next.js 16 + React 19 + Tailwind 4, single process, no external services

## Run it

```bash
npm install
# .env.local:
#   OPENAI_API_KEY=...
#   RELAYROUTER_API_KEY=...     jury (claude-sonnet-5)
#   OPENROUTER_API_KEY=...      jury fallback
#   RELAYDANCE_API_KEY=...      video render
npm run dev
# open http://localhost:3000, click a template brief, watch the studio work
```

## Demo script (2 minutes)

1. Click **+ Kopi Loco $380**: the brief locks into escrow, three directors start concepting.
2. Live feed: three concept pitches land, the jury convenes, duel verdicts stream in with one-line reasons, Bradley-Terry bars rank the concepts.
3. Studio renders the winning concept into an actual 5-second vertical cut (progress bar live).
4. The cut lands on the CEO Gate: watch it, type a note, hit Send back, and the director revises and re-renders. Or hit Accept.
5. Accept releases escrow: invoice issued, treasury ticks up, the video joins the Shipped Reel.

## Roadmap

- Real settlement: x402 / USDC on Base. The founder's Port-USDC repo already implements on-chain agent payments; wiring it into the Acceptance Gate is integration, not invention.
- Multi-shot ads: chain 2-3 renders with continuity frames for 15s spots, add `gpt-image-2` poster and thumbnail deliverables.
- ASP listing: package the studio as an Agent Service Provider in A2A marketplaces (okx.ai-style escrow and acceptance flows map 1:1 to this design).
- AWS deploy: Bedrock inference + S3 media + Lambda pipeline; the credits this hackathon awards are this product's COGS.

## Honest limitations

- Settlement is simulated (deterministic reference, labelled as such in the UI); the on-chain path is roadmap.
- Single continuous 5s shots only; multi-shot editing is not built yet.
- Upstream audio content filter occasionally rejects a render; the pipeline auto-retries once and degrades to concept-only review if both attempts fail.

---

*BUIDL_QUESTS 2026 track: 05 OPC / Super Individuals (primary), 01 Autonomous Agents (secondary).*
