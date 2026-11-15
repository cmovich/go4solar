/** When no plan is ticked "Show on home page", the home page shows this many, by order. */
export const HOME_FALLBACK_COUNT = 3

/**
 * The home page's ready-made plans: `shown` at once (ticked, in their order; else the first
 * three), `more` behind "See more plans". Takes switched-on plans already sorted by order.
 */
export function homePlanSplit<T extends { showOnHome: boolean }>(
  plans: T[],
): { shown: T[]; more: T[] } {
  const anyTicked = plans.some((p) => p.showOnHome)
  const isShown = (p: T, i: number) => (anyTicked ? p.showOnHome : i < HOME_FALLBACK_COUNT)
  return {
    shown: plans.filter(isShown),
    more: plans.filter((p, i) => !isShown(p, i)),
  }
}
