# Aria Studio, pitch reference

## 30-second booth pitch (Top 30 screening)

> Everyone here built agents that write text. My agents ship footage, and my clicks move the money.
>
> Aria Studio is a one-person media company: product ads, travel promos, science explainers. A brief locks budget into escrow. Three director agents pitch concepts. A Claude jury ranks them with pairwise duels and Bradley-Terry, the mechanism that won me rank 1 in Ethereum Foundation's Deep Funding contest. Then comes the point: **concepts cost cents, renders cost dollars, so I greenlight the spend.** Seedance renders the cut, gpt-image-2 ships the key visual, and when I accept, escrow releases as a real USDC transfer on Base Sepolia.
>
> [Point at the Shipped wall.] These were briefs this afternoon. Real cuts, real posters, 99% gross margin, and every dollar passed through a human gate.

## 3-minute pitch (if Top 10)

### 1. Problem (30s)
A 5-second vertical spot still costs an SMB hundreds to thousands of dollars and days of turnaround. Text-to-video collapsed the render cost, but a render button is not a business. Clients pay for concepts, taste, quality control, revisions, and money that moves on acceptance. That workflow layer is what a real studio sells. It used to take a team. Now it takes one human, if the agents are organised like a company.

### 2. Mechanism (60s)
- Brief in, budget locked in escrow. Verticals are the ones my own render infrastructure already serves commercially: product ads, travel, science explainers.
- Three directors with different crafts (product storytelling, travel documentary, explainer visuals) pitch structured concepts. Every prompt carries my Playbook, my creative standards. Edit it live, the studio changes.
- The jury: independent Claude judges duel every pair of concepts on different criteria, Bradley-Terry aggregates. Same stack that took rank 1 on GG24 Deep Funding L3 against hidden human jury ground truth.
- **Gate 1, greenlight: I fund the winning concept, or override the jury.** Cents of duels protect dollars of renders. Human review sits exactly where money is spent.
- Production renders the cut and the campaign poster in parallel, about two minutes.
- **Gate 2, acceptance: I watch the actual footage.** Send back with notes and it revises and re-renders. Accept, and escrow releases: invoice, treasury, and a real USDC transfer on Base Sepolia you can open on BaseScan.

### 3. Live demo (60s)
[The Amber brand-film brief waits at Greenlight. Click to fund the jury pick. While it renders, walk the Shipped wall and the unit economics: avg order ~$390, COGS ~$0.30, margin 99.9%. When the render lands, play it, accept, show the BaseScan transaction.]

### 4. Why now, why me (30s)
Agent commerce rails are being laid right now: x402, okx.ai's escrow-and-acceptance marketplace, launched two weeks ago, is exactly this flow. I run the relay infrastructure my studio consumes (RelayRouter for Claude, RelayDance for Seedance), so my COGS is wholesale, and the same pipeline extends to the game-asset vertical next. The AWS credits from today are literally this company's production budget.

## Q&A prep

- "Isn't the jury just more LLM calls?" Structurally different: independent judges, adversarial pairwise framing, MLE aggregation with known properties, validated against human jury ground truth (Deep Funding L3 rank 1).
- "Why three directors instead of one?" Diversity makes the jury informative, and the whole exploration costs three cents. The expensive step is gated by a human.
- "Is the money real?" Testnet USDC on Base Sepolia via ethers v6, real transactions you can open on BaseScan. Mainnet is a config change plus compliance, and x402 intake is the next integration (official facilitator is free).
- "What if the render fails?" Constrained prompts (no text, logos, likeness, dialogue), one auto-retry, then degrade to concept-plus-poster review. The human gate is the final safety layer.
- "Why will clients pay $300 for this?" They pay $2,000 and wait a week today. Same-hour turnaround with a human accountable for quality is the product; the margin funds the founder's time on taste, not production.
- "What's defensible?" Every duel verdict is training signal about my taste. Playbook plus duel history is a proprietary dataset of one person's creative judgment, exactly the asset an OPC monetises.

## One-liners to land

- "Agents ship footage. Humans move money."
- "Cents of duels protect dollars of renders."
- "Two gates: greenlight the spend, accept to release escrow."
- "The jury that won an Ethereum Foundation contest runs my QA."
