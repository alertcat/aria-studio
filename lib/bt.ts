// Bradley-Terry aggregation of pairwise duel outcomes.
// Same mechanism the founder used to win GG24 Deep Funding L3 (#1):
// LLM jurors produce pairwise verdicts, BT MLE turns them into a global ranking.

export type Comparison = { winner: string; loser: string }

export function bradleyTerry(
  items: string[],
  comparisons: Comparison[],
  iterations = 100,
): Record<string, number> {
  // 0.5 pseudo-win each way per pair keeps the MLE finite when someone is undefeated
  const wins: Record<string, Record<string, number>> = {}
  for (const a of items) {
    wins[a] = {}
    for (const b of items) if (a !== b) wins[a][b] = 0.5
  }
  for (const c of comparisons) {
    if (wins[c.winner] && c.winner !== c.loser) wins[c.winner][c.loser] += 1
  }

  const p: Record<string, number> = {}
  for (const it of items) p[it] = 1 / items.length

  for (let k = 0; k < iterations; k++) {
    const next: Record<string, number> = {}
    for (const i of items) {
      let wi = 0
      let denom = 0
      for (const j of items) {
        if (i === j) continue
        const nij = wins[i][j] + wins[j][i]
        wi += wins[i][j]
        denom += nij / (p[i] + p[j])
      }
      next[i] = denom > 0 ? wi / denom : p[i]
    }
    const sum = Object.values(next).reduce((s, v) => s + v, 0)
    for (const i of items) p[i] = next[i] / sum
  }
  return p
}
