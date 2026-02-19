const K = 32

/** Calculate new ELO after answering a pair with given difficulty */
export function calculateElo(currentElo: number, difficulty: number, won: boolean): number {
  const opponentRating = 800 + difficulty * 800
  const expected = 1 / (1 + Math.pow(10, (opponentRating - currentElo) / 400))
  const actual = won ? 1 : 0
  const delta = K * (actual - expected)
  const minDelta = won ? Math.max(1, delta) : Math.min(-1, delta)
  return Math.round(currentElo + minDelta)
}

/** Check if an answer is correct. Same-day = either answer is correct. */
export function isCorrect(chosenDate: string, otherDate: string): boolean {
  if (chosenDate === otherDate) return true
  return chosenDate < otherDate
}
