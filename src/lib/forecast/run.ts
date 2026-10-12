import type { ForecastMonth, ForecastResult, ForecastScenario, ForecastYear } from './types'

/**
 * Monthly cohort model (PRD "Forecasting engine"). Month m (0-based) is in year y = floor(m/12)+1.
 *  - new systems  = newPerMonthYear1 × (1 + growth)^(y−1)
 *  - price factor = (1 + inflation)^(y−1) × (1 + devaluation)^(y−1)
 *  - booked: each cohort's profit counts in its install month; cash: spread evenly over the tenure
 *    (profit after the horizon is not counted)
 *  - overheads = fixed × (1 + overhead growth)^(y−1) + new systems × per-system × inflation factor
 *  - capital needed = new systems × drawn × price factor; extra defaults lose that share of it
 *  - CO₂ = installed base × tonnes per system per year ÷ 12, each month
 */
export function runForecast(s: ForecastScenario): ForecastResult {
  if (!Number.isInteger(s.years) || s.years < 1 || s.years > 10) {
    throw new Error('The horizon must be 1 to 10 years')
  }
  const totalMonths = s.years * 12
  const tenure = Math.max(1, Math.round(s.tenureMonths))
  const contribution = new Array<number>(totalMonths).fill(0)
  const months: ForecastMonth[] = []

  let installedBase = 0
  for (let m = 0; m < totalMonths; m++) {
    const y = Math.floor(m / 12) + 1
    const systems = s.newPerMonthYear1 * (1 + s.growthPerYear) ** (y - 1)
    const infl = (1 + s.inflationPerYear) ** (y - 1)
    const price = infl * (1 + (s.nairaDevaluationPerYear ?? 0)) ** (y - 1)
    const drawn = systems * s.drawnPerSystemYear1 * price
    const cohortProfit =
      systems * s.netProfitPerSystemYear1 * price - drawn * (s.defaultRateExtra ?? 0)

    if (s.mode === 'booked') contribution[m]! += cohortProfit
    else
      for (let k = m; k < Math.min(totalMonths, m + tenure); k++)
        contribution[k]! += cohortProfit / tenure

    installedBase += systems
    const overheads =
      s.overheadFixedPerMonthYear1 * (1 + s.overheadGrowthPerYear) ** (y - 1) +
      systems * s.overheadPerSystemYear1 * infl
    months.push({
      month: m + 1,
      year: y,
      systems,
      contribution: 0,
      overheads,
      netProfit: 0,
      cumulativeNet: 0,
      capitalNeeded: drawn,
      co2Tonnes: (installedBase * s.co2TonnesPerSystemYear) / 12,
      installedBase,
    })
  }

  let cumulative = 0
  let breakEvenMonth: number | null = null
  for (const row of months) {
    row.contribution = contribution[row.month - 1]!
    row.netProfit = row.contribution - row.overheads
    cumulative += row.netProfit
    row.cumulativeNet = cumulative
    if (breakEvenMonth === null && cumulative >= 0) breakEvenMonth = row.month
  }

  const years: ForecastYear[] = []
  let cumulativeCo2 = 0
  for (let y = 1; y <= s.years; y++) {
    const rows = months.slice((y - 1) * 12, y * 12)
    const sum = (k: keyof ForecastMonth) => rows.reduce((t, r) => t + (r[k] as number), 0)
    const co2Tonnes = sum('co2Tonnes')
    cumulativeCo2 += co2Tonnes
    years.push({
      year: y,
      systems: sum('systems'),
      contribution: sum('contribution'),
      overheads: sum('overheads'),
      netProfit: sum('netProfit'),
      cumulativeNet: rows[rows.length - 1]!.cumulativeNet,
      capitalNeeded: sum('capitalNeeded'),
      co2Tonnes,
      cumulativeCo2Tonnes: cumulativeCo2,
    })
  }
  const peak = years.reduce(
    (best, y) => (y.capitalNeeded > best.capitalNeeded ? y : best),
    years[0]!,
  )
  return { years, months, breakEvenMonth, peakCapitalYear: peak.year }
}
