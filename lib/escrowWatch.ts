import { ethers } from 'ethers'

// Inbound escrow watcher, ported from the founder's midnight-studio-bot
// usdt_listener (TRC-20 -> Base Sepolia USDC). Same discipline:
// backfill-on-startup (never credit pre-existing transfers), txid
// idempotency, dust filter, generous poll interval.

const USDC_ADDR = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
const POLL_MS = 20_000

const g = globalThis as unknown as { __escrowWatch?: boolean }

export function startEscrowWatch(notify: (tag: string, text: string) => void) {
  if (g.__escrowWatch) return
  const pk = process.env.CHAIN_BUYER_PK
  if (!pk) return
  g.__escrowWatch = true

  const provider = new ethers.JsonRpcProvider(RPC)
  const escrow = new ethers.Wallet(pk).address
  const usdc = new ethers.Contract(
    USDC_ADDR,
    ['event Transfer(address indexed from, address indexed to, uint256 value)'],
    provider,
  )
  let lastBlock = 0
  const seen = new Set<string>()

  const tick = async () => {
    try {
      const latest = await provider.getBlockNumber()
      if (lastBlock === 0) {
        // backfill: everything before boot is "seen", never credited
        lastBlock = latest
        notify('CHAIN', `Escrow watcher live: USDC deposits to ${escrow.slice(0, 10)}... on Base Sepolia`)
        return
      }
      if (latest <= lastBlock) return
      const events = await usdc.queryFilter(usdc.filters.Transfer(undefined, escrow), lastBlock + 1, latest)
      lastBlock = latest
      for (const e of events) {
        const log = e as ethers.EventLog
        if (seen.has(log.transactionHash)) continue
        seen.add(log.transactionHash)
        const amt = Number(ethers.formatUnits(log.args[2] as bigint, 6))
        if (amt < 0.01) continue // dust filter
        notify(
          'CHAIN',
          `Escrow funded on-chain: +${amt.toFixed(2)} USDC received, tx ${log.transactionHash.slice(0, 14)}...`,
        )
      }
    } catch {
      /* transient RPC error: next tick retries */
    }
  }

  setInterval(tick, POLL_MS)
  void tick()
}
