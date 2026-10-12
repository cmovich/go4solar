import type { TenureMonths } from '@/lib/pricing/types'
import { loanProfit } from '@/lib/profit/loanProfit'
import type { UnitCosts } from '@/lib/profit/types'

import type { ForecastScenario } from './types'

/**
 * What staff edit for a scenario (PRD "Forecasting engine"). Defaults come from today's settings
 * (unit costs, overheads, funders, sizing); profit and money drawn per system are worked out
 * with the same profit engine as approvals.
 */
export type ScenarioInputs = {
  years: number
  mode: 'booked' | 'cash'
  newPerMonthYear1: number
  growthLow: number
  growthBase: number
  growthHigh: number
  inflationPerYear: number
  nairaDevaluationPerYear: number
  defaultRateExtra: number
  avgSystemPrice: number
  avgCostPrice: number
  depositShare: number
  /** Share of customers on each tenure (normalised; need not add up to exactly 1). */
  tenureMix: Record<TenureMonths, number>
  funderAnnualRate: number
  /** Share of the money drawn that comes from Go4Solar's own fund (no interest). */
  ownFundShare: number
  unitCosts: UnitCosts
  overheadFixedPerMonthYear1: number
  overheadGrowthPerYear: number
  overheadPerSystemYear1: number
  co2TonnesPerSystemYear: number
  /** "What if": customers one member of staff can serve in a year (admin-set). */
  customersPerStaff: number
  /** Inputs taken from SAMPLE or unverified sources: exports label them. */
  sampleInputs: string[]
}

export type ScenarioVariant = 'low' | 'base' | 'high'

const TENURES: TenureMonths[] = [3, 6, 9, 12]

/** Net profit and money drawn for one average system, weighted over the tenure mix. */
export function perSystem(i: ScenarioInputs): {
  netProfit: number
  drawn: number
  tenureMonths: number
} {
  const deposit = Math.round(i.avgSystemPrice * i.depositShare)
  const weights = TENURES.map((t) => Math.max(0, i.tenureMix[t] ?? 0))
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let net = 0
  let tenure = 0
  let drawn = 0
  TENURES.forEach((t, k) => {
    const w = weights[k]! / total
    if (w === 0) return
    const p = loanProfit({
      systemPrice: i.avgSystemPrice,
      costPrice: i.avgCostPrice,
      deposit,
      tenureMonths: t,
      funderAnnualRate: i.funderAnnualRate * (1 - i.ownFundShare),
      funderMethod: 'flat',
      unitCosts: i.unitCosts,
    })
    net += w * p.netProfit
    tenure += w * t
    drawn = p.drawn
  })
  if (weights.every((w) => w === 0)) drawn = Math.max(0, i.avgCostPrice - deposit)
  return { netProfit: Math.round(net), drawn, tenureMonths: tenure || 12 }
}

export function scenarioFromInputs(
  i: ScenarioInputs,
  variant: ScenarioVariant = 'base',
): ForecastScenario {
  const p = perSystem(i)
  return {
    years: i.years,
    newPerMonthYear1: i.newPerMonthYear1,
    growthPerYear:
      variant === 'low' ? i.growthLow : variant === 'high' ? i.growthHigh : i.growthBase,
    inflationPerYear: i.inflationPerYear,
    netProfitPerSystemYear1: p.netProfit,
    drawnPerSystemYear1: p.drawn,
    tenureMonths: Math.round(p.tenureMonths),
    overheadFixedPerMonthYear1: i.overheadFixedPerMonthYear1,
    overheadGrowthPerYear: i.overheadGrowthPerYear,
    overheadPerSystemYear1: i.overheadPerSystemYear1,
    co2TonnesPerSystemYear: i.co2TonnesPerSystemYear,
    defaultRateExtra: i.defaultRateExtra,
    nairaDevaluationPerYear: i.nairaDevaluationPerYear,
    mode: i.mode,
  }
}

/** "What if": a number of customers in a year at today's prices. */
export function whatIf(i: ScenarioInputs, customersPerYear: number) {
  const p = perSystem(i)
  return {
    netProfit: Math.round(
      customersPerYear * (p.netProfit - i.overheadPerSystemYear1) -
        12 * i.overheadFixedPerMonthYear1,
    ),
    capitalNeeded: customersPerYear * p.drawn,
    co2Tonnes: customersPerYear * i.co2TonnesPerSystemYear,
    staffNeeded: Math.ceil(customersPerYear / Math.max(1, i.customersPerStaff)),
  }
}

export type WaitlistLeadSummary = {
  createdAt: string
  systemPrice: number | null
  costPrice: number | null
  depositShare: number | null
  plan: string | null
  applicantType: string | null
  co2Kg: number | null
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const shares = (xs: string[]) => {
  const out: Record<string, number> = {}
  for (const x of xs) out[x] = (out[x] ?? 0) + 1 / xs.length
  return out
}

/**
 * "From the waiting list": sign-ups per month, average system price and cost, deposit share,
 * plan mix, home/business split and CO₂ per system from current (non-test) sign-ups. Anything the
 * sign-ups do not tell us stays at today's defaults.
 */
export function inputsFromWaitlist(leads: WaitlistLeadSummary[], defaults: ScenarioInputs) {
  const complete = leads.filter((l) => l.systemPrice !== null)
  const byMonth: Record<string, number> = {}
  for (const l of leads) {
    const key = new Date(new Date(l.createdAt).getTime() + 3_600_000).toISOString().slice(0, 7)
    byMonth[key] = (byMonth[key] ?? 0) + 1
  }
  const keys = Object.keys(byMonth).sort()
  const span = keys.length
    ? (Number(keys.at(-1)!.slice(0, 4)) - Number(keys[0]!.slice(0, 4))) * 12 +
      (Number(keys.at(-1)!.slice(5)) - Number(keys[0]!.slice(5))) +
      1
    : 1
  const price = avg(complete.map((l) => l.systemPrice!))
  const cost = avg(complete.map((l) => l.costPrice).filter((v): v is number => v !== null))
  const deposit = avg(complete.map((l) => l.depositShare).filter((v): v is number => v !== null))
  const co2 = avg(complete.map((l) => l.co2Kg).filter((v): v is number => v !== null))
  const inputs: ScenarioInputs = {
    ...defaults,
    newPerMonthYear1: leads.length ? leads.length / span : defaults.newPerMonthYear1,
    avgSystemPrice: price !== null ? Math.round(price) : defaults.avgSystemPrice,
    avgCostPrice: cost !== null ? Math.round(cost) : defaults.avgCostPrice,
    depositShare: deposit ?? defaults.depositShare,
    co2TonnesPerSystemYear: co2 !== null ? co2 / 1000 : defaults.co2TonnesPerSystemYear,
  }
  return {
    inputs,
    summary: {
      signUps: leads.length,
      complete: complete.length,
      byMonth,
      planMix: shares(complete.map((l) => l.plan).filter((v): v is string => Boolean(v))),
      typeSplit: shares(
        complete.map((l) => l.applicantType).filter((v): v is string => Boolean(v)),
      ),
    },
  }
}
