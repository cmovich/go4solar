/** One forecast scenario: every input editable (PRD "Forecasting engine"). */
export type ForecastScenario = {
  /** Horizon, 1 to 10 years. */
  years: number
  newPerMonthYear1: number
  /** Growth in new systems per year (0.4 = 40% more each year). */
  growthPerYear: number
  /** Price inflation per year: profit per system and money drawn grow with it. */
  inflationPerYear: number
  netProfitPerSystemYear1: number
  /** Funder money drawn per system (cost price − deposit). */
  drawnPerSystemYear1: number
  tenureMonths: number
  overheadFixedPerMonthYear1: number
  overheadGrowthPerYear: number
  overheadPerSystemYear1: number
  /** CO₂ avoided per installed system per year, tonnes. */
  co2TonnesPerSystemYear: number
  /** Extra default rate: that share of the money drawn is lost on every new system. */
  defaultRateExtra?: number
  /**
   * Naira devaluation per year. Equipment costs rise and prices follow through the markup, so naira
   * profit per system and money drawn rise by (1 + d)^(year − 1); overheads do not follow.
   */
  nairaDevaluationPerYear?: number
  /** booked: profit counted in the month installed; cash: spread evenly over the tenure. */
  mode: 'booked' | 'cash'
}

export type ForecastRow = {
  systems: number
  /** Profit from systems before overheads. */
  contribution: number
  overheads: number
  netProfit: number
  cumulativeNet: number
  /** Funder money drawn for new systems in the period. */
  capitalNeeded: number
  co2Tonnes: number
}

export type ForecastMonth = ForecastRow & { month: number; year: number; installedBase: number }
export type ForecastYear = ForecastRow & { year: number; cumulativeCo2Tonnes: number }

export type ForecastResult = {
  years: ForecastYear[]
  months: ForecastMonth[]
  /** First month (1-based) where cumulative net profit is 0 or more; null if never. */
  breakEvenMonth: number | null
  /** The year that needs the most funder money. */
  peakCapitalYear: number
}
