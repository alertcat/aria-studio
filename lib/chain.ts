import { ethers } from 'ethers'

// Base Sepolia USDC settlement. The buyer wallet stands in for the client's
// escrow; acceptance triggers a real on-chain transfer to the studio treasury.
// Testnet scale: $1 of order value = 0.01 USDC.

const USDC_ADDR = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Circle USDC, Base Sepolia
const RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'

export function chainEnabled() {
  return !!(process.env.CHAIN_BUYER_PK && process.env.CHAIN_STUDIO_ADDR)
}

export async function settleUsdc(
  amountUsd: number,
): Promise<{ hash: string; url: string; usdc: string }> {
  const provider = new ethers.JsonRpcProvider(RPC)
  const wallet = new ethers.Wallet(process.env.CHAIN_BUYER_PK!, provider)
  const usdc = new ethers.Contract(
    USDC_ADDR,
    [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address) view returns (uint256)',
    ],
    wallet,
  )
  const human = (amountUsd / 100).toFixed(2)
  const units = ethers.parseUnits(human, 6)
  const bal: bigint = await usdc.balanceOf(wallet.address)
  if (bal < units) throw new Error(`buyer wallet USDC balance too low (${ethers.formatUnits(bal, 6)})`)
  const tx = await usdc.transfer(process.env.CHAIN_STUDIO_ADDR!, units)
  const receipt = await tx.wait()
  return {
    hash: receipt!.hash,
    url: `https://sepolia.basescan.org/tx/${receipt!.hash}`,
    usdc: human,
  }
}
