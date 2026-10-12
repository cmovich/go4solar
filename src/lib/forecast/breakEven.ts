/** Systems a year needed to cover fixed overheads: fixed ÷ (net profit − cost per system). */
export function breakEvenSystemsPerYear(
  fixedOverheadsPerYear: number,
  netProfitPerSystem: number,
  overheadPerSystem: number,
): number | null {
  const margin = netProfitPerSystem - overheadPerSystem
  return margin > 0 ? fixedOverheadsPerYear / margin : null
}
