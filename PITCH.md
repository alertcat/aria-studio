# SoloCorp OS, pitch reference

## 30-second booth pitch (Top 30 screening)

> Everyone here built agents that write text. My agents ship footage.
>
> SoloCorp OS is a one-person ad studio. A client brief locks budget into escrow. Three director agents pitch concepts. Then an AI jury runs pairwise duels and aggregates them with Bradley-Terry, the same mechanism that won me rank 1 in Ethereum Foundation's Deep Funding contest. The winning concept goes straight into a Seedance render pipe and comes back as a real 5-second vertical ad.
>
> [Point at the Shipped Reel, videos playing.] These were briefs two hours ago. They are watchable cuts now.
>
> The last step is the point: my click of Accept is what releases the escrow. Human experience sets the bar, agents run the loop, human review moves the money. That is the OPC formula, running end to end.

## 3-minute pitch (if Top 10)

### 1. Problem (30s)
A 5-second bumper ad still costs an SMB hundreds to thousands of dollars and days of agency back-and-forth. Text-to-video collapsed the render cost, but a render button is not a business. Clients pay for concept development, taste, quality control, revisions, and a clean commercial loop where money moves on acceptance. That workflow is what a real studio sells. It used to take a team. It now takes one human and agents, if the quality layer is trustworthy.

### 2. Mechanism (60s)
- Brief in, budget locked in escrow.
- Three director agents with different creative personalities (hype, cinematic, playful) pitch structured concepts in parallel. Every prompt carries the CEO Playbook, my creative standards: hook in half a second, one idea per ad, end on the product. Edit the Playbook live and the whole studio changes.
- The jury: independent Claude judges compare every pair of concepts head-to-head on different criteria, brand fit versus scroll-stopping power, and Bradley-Terry aggregates the verdicts into a ranking. Pairwise-then-aggregate is how real juries work. This exact stack took rank 1 on GG24 Deep Funding L3 against hidden human jury ground truth. And it has a second job here: cents of text duels protect dollars of render spend.
- The winning concept renders on Seedance 2.0 into an actual vertical cut, about two and a half minutes.
- The cut lands on my Acceptance Gate. Send back with notes and the director revises and re-renders. Accept, and escrow releases: invoice, treasury, agent reputation.

### 3. Live demo (60s)
[Fire a fresh brief at pitch start so the render completes mid-pitch. While it renders, walk the feed: concept pitches, duel verdicts with one-line reasons, Bradley-Terry bars. Show the Shipped Reel of already-delivered cuts. When the live render lands, play it, type one CEO note, send back or accept. On accept, treasury ticks.]

### 4. Why now, why me (30s)
Agent-to-agent commerce is being assembled right now: x402 payments, okx.ai's escrow-and-acceptance marketplace launched two weeks ago, and its flow is exactly this: escrow, deliver, human acceptance releases funds. I run the relay infrastructure my studio consumes (relayrouter.io for Claude, relaydance.com for Seedance), so my COGS is wholesale. I have shipped on-chain agent payments before (Port-USDC on Base Sepolia). SoloCorp OS is the operating layer a solo builder needs to sell agent work into that economy, and the AWS credits from today are literally its production budget.

## Q&A prep

- "Isn't the jury just more LLM calls?" It is structurally different: independent judges, adversarial pairwise framing, and an MLE aggregation with known statistical properties. Validated competitively against human jury ground truth (Deep Funding L3 rank 1).
- "Why three agents instead of one good one?" Diversity makes the jury informative: three creative personalities explore the concept space, the jury exploits it. A concept costs about a cent; a render costs about a dollar. The jury is the economic filter between them.
- "What if the render fails or is unsafe?" Prompts are constrained (no text, no logos, no likeness, no dialogue), the pipeline auto-retries, and failed renders degrade to concept-only review. The human gate is the final safety layer.
- "Why simulated settlement?" Honesty over theater: the settlement reference is labelled simulated. The x402/USDC path exists in my Port-USDC repo; it is integration work, not invention.
- "What is defensible?" Every duel verdict is training signal about my taste. The Playbook plus duel history becomes a proprietary dataset of one person's creative judgment, exactly the asset an OPC monetises.

## One-liners to land

- "Agents that ship footage, not paragraphs."
- "Cents of jury duels protect dollars of render spend."
- "My click is the payment switch."
- "The jury that won an Ethereum Foundation contest now runs my QA."
