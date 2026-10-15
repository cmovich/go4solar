import { describe, expect, it } from 'vitest'

import { loanProfit } from '@/lib/profit/loanProfit'

import { runForecast } from './run'
import {
  inputsFromWaitlist,
  perSystem,
  scenarioFromInputs,
  whatIf,
  type ScenarioInputs,
  type WaitlistLeadSummary,
} from './scenario'

// The PRD loan: ₦2,475,248 price, ₦1,800,000 cost, 20% deposit, 12 months, Funder A at 16%.
const inputs: ScenarioInputs = {
  years: 10,
  mode: 'booked',
  newPerMonthYear1: 20,
  growthBase: 0.4,
  growthLow: 0.2,
  growthHigh: 0.6,
  inflationPerYear: 0.12,
  nairaDevaluationPerYear: 0,
  defaultRateExtra: 0,
  avgSystemPrice: 2475248,
  avgCostPrice: 1800000,
  depositShare: 0.2,
  tenureMix: { 3: 0, 6: 0, 9: 0, 12: 1 },
  funderAnnualRate: 0.16,
  ownFundShare: 0,
  unitCosts: { kycPerLoan: 10000, feePerInstalment: 300, lossProvisionShare: 0.02 },
  overheadFixedPerMonthYear1: 4000000,
  overheadGrowthPerYear: 0.15,
  overheadPerSystemYear1: 40000,
  co2TonnesPerSystemYear: 1.5,
  customersPerStaff: 250,
  sampleInputs: [],
}

describe('perSystem', () => {
  it('uses the profit engine: the PRD example gives about ₦413,251 net and ₦1,304,950 drawn', () => {
    const p = perSystem(inputs)
    const engine = loanProfit({
      systemPrice: 2475248,
      costPrice: 1800000,
      deposit: Math.round(2475248 * 0.2),
      tenureMonths: 12,
      funderAnnualRate: 0.16,
      funderMethod: 'flat',
      unitCosts: inputs.unitCosts,
    })
    expect(p.netProfit).toBe(engine.netProfit)
    expect(p.drawn).toBe(1304950)
    expect(p.tenureMonths).toBe(12)
    expect(Math.abs(p.netProfit - 413251)).toBeLessThanOrEqual(2)
  })

  it('a tenure mix weights each tenure; own-fund money costs no interest', () => {
    const mixed = perSystem({ ...inputs, tenureMix: { 3: 0.5, 6: 0, 9: 0, 12: 0.5 } })
    expect(mixed.tenureMonths).toBe(7.5)
    const own = perSystem({ ...inputs, ownFundShare: 1 })
    expect(own.netProfit).toBeGreaterThan(perSystem(inputs).netProfit)
  })
})

describe('scenarioFromInputs', () => {
  it('Low / Base / High differ only in growth', () => {
    const low = scenarioFromInputs(inputs, 'low')
    const baseS = scenarioFromInputs(inputs, 'base')
    const high = scenarioFromInputs(inputs, 'high')
    expect([low.growthPerYear, baseS.growthPerYear, high.growthPerYear]).toEqual([0.2, 0.4, 0.6])
    const r = (s: typeof low) => runForecast(s).years.at(-1)!.netProfit
    expect(r(low)).toBeLessThan(r(baseS))
    expect(r(baseS)).toBeLessThan(r(high))
  })
})

describe('whatIf', () => {
  it('customers a year → net profit, funder money needed, CO₂ and staff (today’s prices)', () => {
    const p = perSystem(inputs)
    const w = whatIf(inputs, 1000)
    expect(w.netProfit).toBe(Math.round(1000 * (p.netProfit - 40000) - 12 * 4000000))
    expect(w.capitalNeeded).toBe(1000 * p.drawn)
    expect(w.co2Tonnes).toBe(1500)
    expect(w.staffNeeded).toBe(4)
  })
})

describe('inputsFromWaitlist', () => {
  const leads: WaitlistLeadSummary[] = [
    {
      createdAt: '2026-08-03T10:00:00Z',
      systemPrice: 2000000,
      costPrice: 1500000,
      depositShare: 0.2,
      plan: 'comfort',
      applicantType: 'individual',
      co2Kg: 1200,
    },
    {
      createdAt: '2026-08-20T10:00:00Z',
      systemPrice: 3000000,
      costPrice: 2200000,
      depositShare: 0.4,
      plan: 'independence',
      applicantType: 'business',
      co2Kg: 2400,
    },
    {
      createdAt: '2026-09-05T10:00:00Z',
      systemPrice: 2500000,
      costPrice: 1900000,
      depositShare: 0.3,
      plan: 'comfort',
      applicantType: 'individual',
      co2Kg: null,
    },
    {
      createdAt: '2026-10-01T10:00:00Z',
      systemPrice: null,
      costPrice: null,
      depositShare: null,
      plan: null,
      applicantType: null,
      co2Kg: null,
    },
  ]

  it('builds the inputs from current sign-ups (averages of complete ones) and says what it used', () => {
    const r = inputsFromWaitlist(leads, inputs)
    expect(r.inputs.avgSystemPrice).toBe(2500000)
    expect(r.inputs.avgCostPrice).toBe(1866667)
    expect(r.inputs.depositShare).toBeCloseTo(0.3)
    expect(r.inputs.co2TonnesPerSystemYear).toBeCloseTo(1.8)
    // 4 sign-ups over 3 calendar months (Aug–Oct).
    expect(r.inputs.newPerMonthYear1).toBeCloseTo(4 / 3)
    expect(r.summary).toMatchObject({
      signUps: 4,
      complete: 3,
      byMonth: { '2026-08': 2, '2026-09': 1, '2026-10': 1 },
      planMix: { comfort: 2 / 3, independence: 1 / 3 },
      typeSplit: { individual: 2 / 3, business: 1 / 3 },
    })
    // Everything else comes from the defaults (today's settings).
    expect(r.inputs.funderAnnualRate).toBe(0.16)
  })

  it('no complete sign-ups: keeps the defaults', () => {
    const r = inputsFromWaitlist([leads[3]!], inputs)
    expect(r.inputs.avgSystemPrice).toBe(inputs.avgSystemPrice)
  })
})
