const K = 32

/** Calculate new ELO after answering a pair with given difficulty */
export function calculateElo(currentElo: number, difficulty: number, won: boolean): number {
  const opponentRating = difficulty * 2000
  const expected = 1 / (1 + Math.pow(10, (opponentRating - currentElo) / 400))
  const actual = won ? 1 : 0
  const delta = K * (actual - expected)
  // Ensure correct answers always gain at least 1 ELO and wrong answers always lose at least 1
  const minDelta = won ? Math.max(1, delta) : Math.min(-1, delta)
  return Math.round(currentElo + minDelta)
}

/** Get streak multiplier: 1x (<5), 2x (5-9), 3x (10+) */
export function getStreakMultiplier(streak: number): number {
  if (streak >= 10) return 3
  if (streak >= 5) return 2
  return 1
}

/** Calculate points earned/lost */
export function calculatePoints(difficulty: number, won: boolean, streak: number): number {
  if (won) {
    return Math.max(10, Math.round(difficulty * 100)) * getStreakMultiplier(streak)
  }
  return -Math.max(5, Math.round(difficulty * 50))
}

/** Check if an answer is correct. Same-day = either answer is correct. */
export function isCorrect(chosenDate: string, otherDate: string): boolean {
  if (chosenDate === otherDate) return true
  return chosenDate < otherDate
}
