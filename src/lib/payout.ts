export function calculateEarningsCents(
  views: number,
  payoutPer1kViewsCents: number
): number {
  if (views <= 0 || payoutPer1kViewsCents <= 0) return 0;
  return Math.floor(views / 1000) * payoutPer1kViewsCents;
}

export function wouldExceedBudget(
  currentSpentCents: number,
  newEarningsCents: number,
  totalBudgetCents: number
): boolean {
  return currentSpentCents + newEarningsCents > totalBudgetCents;
}
