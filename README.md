# Aria Studio, a solo performance

**1 human x 3 agents = a media production company.**
Director agents pitch concepts, a Claude jury ranks them through pairwise duels, the human CEO greenlights the spend, Seedance renders real footage, gpt-image-2 ships the key visual, and the CEO's final acceptance releases escrow, with USDC settlement on Base Sepolia.

Built solo in one day at **BUIDL_OPC_Hackathon_SG** (Singapore, 2026-07-12). All code in this repo was written during the event (see commit history).

## The real problem

A 5-second vertical spot still costs an SMB hundreds to thousands of dollars and days of agency turnaround. Text-to-video collapsed the render cost, but a render button is not a business. Clients pay for concept development, taste, quality control, revisions, and a commercial loop where money moves on acceptance. That workflow layer is what a one-person studio actually sells. Aria Studio is that layer, run by agents, gated by a human, in the three verticals its render infrastructure (RelayDance) already serves commercially: **product ads, travel promos, science explainers**.

The deliverable is never a wall of text. It is a watchable cut plus a campaign key visual.

## The OPC formula, implemented literally

`OPC = Human's Experience + AI's Loop + Human's Review`

| Theme term | Mechanism |
|---|---|
| Human's Experience | The **CEO Playbook**: the founder's creative standards, injected into every agent prompt. Edit it live, the whole studio changes. |
| AI's Loop | Brief -> 3 directors pitch structured concepts -> **jury: pairwise duels + Bradley-Terry** -> render + poster in parallel -> revision loop on CEO notes. |
| Human's Review | **Twice, where the money is.** Gate 1, Greenlight: concepts cost cents, renders cost dollars, the human approves the spend (and can override the jury). Gate 2, Acceptance: the human watches the actual cut, and accepting releases escrow as a real USDC transfer on Base Sepolia. |

## Why the jury matters

Single-shot "rate this 1-10" scoring is vibes. Aria Studio ranks concepts the way real juries work: independent Claude judges compare every pair head-to-head on different criteria (client fit vs scroll-stopping power), and **Bradley-Terry MLE** aggregates the verdicts into a ranking. This exact mechanism took **rank 1 on GG24 Deep Funding Level 3** (Ethereum Foundation / Gitcoin), scored against hidden human jury ground truth. Here it doubles as the economic filter: cents of text duels protect dollars of render spend.

## Architecture

```
client brief ($ locked in escrow)
   |
   v
3 director agents pitch concepts (JSON)     gpt-5.4-mini
   HALE product storyteller / WANDER travel & lifestyle / SAGE explainer
   |
   v
jury: 3 pairwise duels x 2 Claude judges    claude-sonnet-5 on the founder's own relay
   -> Bradley-Terry ranking
   |
   v
GATE 1: CEO greenlight (fund a concept, override allowed)
   |
   v
production, in parallel:                    seedance 2.0 mini (5s, 9:16, ~120s)
   video render + campaign poster           gpt-image-2 (~20s)
   |
   v
GATE 2: CEO acceptance
   -> send back with notes: revised concept, re-render
   -> accept: escrow released, invoice issued,
      USDC transfer on Base Sepolia (ethers v6), treasury +$
```

Resilience: every LLM, render and image output is disk-cached; if the venue network dies, the pipeline replays at human pace. Render prompts are constrained (no text, no logos, no likeness, no dialogue) and auto-retry once to dodge upstream content-filter false positives.

Unit economics per order (shown live in the UI): concepts ~$0.02, jury ~$0.01, render ~$0.25, poster ~$0.02. Order prices $250-520. Gross margin above 99%.

## Run it

```bash
npm install
# .env.local:
#   OPENAI_API_KEY=...          directors
#   RELAYROUTER_API_KEY=...     jury (claude-sonnet-5), founder's own relay
#   OPENROUTER_API_KEY=...      jury fallback
#   RELAYDANCE_API_KEY=...      seedance render + gpt-image-2 poster
#   CHAIN_BUYER_PK=...          optional: Base Sepolia settlement
#   CHAIN_STUDIO_ADDR=...       optional: treasury address
npm run dev
# open http://localhost:3000
```

## Demo script (2 minutes)

1. The Amber brand-film brief sits at **Greenlight**: three ranked concepts, jury bars, one click funds the winner (or override the jury).
2. While it renders (live progress), walk the **Shipped work** wall: real cuts, real posters, prices and margins.
3. The cut lands at the **Gate**: watch it, send back with one line of notes (revise + re-render), or accept.
4. Accept releases escrow: invoice, treasury ticks, and a real USDC transfer confirms on BaseScan.

## Roadmap

- x402 protocol intake: charge for briefs over HTTP 402 with the official `@x402/next` middleware (facilitator already free on testnet).
- Multi-shot spots: chain renders with continuity frames for 15-30s formats.
- Game-asset vertical: gpt-image-2 texture and sprite packs with a three.js preview, same pipeline, new deliverable type.
- ASP listing in A2A marketplaces (okx.ai-style escrow and acceptance map 1:1 to this design).
- AWS deploy: Bedrock inference, S3 media, Lambda pipeline. The credits this hackathon awards are this product's COGS.

## Honest limitations

- Single continuous 5s shots; multi-shot editing not built yet.
- The three template orders settled with simulated references before the chain wallet was funded; live orders settle on-chain when `CHAIN_BUYER_PK` is funded (Circle faucet, Base Sepolia).
- Upstream audio content filter occasionally rejects a render; auto-retry once, then degrade to concept-plus-poster review.

## Attribution

- Rendering: Seedance 2.0 mini and gpt-image-2 via [RelayDance](https://relaydance.com) (the founder's own relay service); jury inference via [RelayRouter](https://relayrouter.io) (same); concepts via OpenAI API.
- Framework: Next.js 16, React 19, Tailwind CSS 4, ethers v6. UI written during the event.
- Mechanism provenance: the pairwise-duel + Bradley-Terry jury design follows the founder's GG24 Deep Funding L3 winning pipeline (pre-event work used as inspiration only; all code here is fresh).
- USDC test contract: Circle, Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- Frontend design discipline: [taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT) applied via Claude Code.
- Escrow inbound watcher pattern ported from the founder's own midnight-studio-bot (private repo, USDT listener re-targeted to Base Sepolia USDC).
- Built with Claude Code as pair programmer (commits co-authored).

---

*BUIDL_QUESTS 2026 track: 05 OPC / Super Individuals (primary), 01 Autonomous Agents (secondary).*
