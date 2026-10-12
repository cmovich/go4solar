import { describe, expect, it } from 'vitest'

import { breakEvenSystemsPerYear } from './breakEven'
import { runForecast } from './run'
import type { ForecastScenario } from './types'

// PRD "Illustrative 10-year projection": 20 a month, 40% growth, 12% inflation, ₦413,252 net and
// ₦1,304,950 drawn per system, ₦4m a month fixed overheads growing 15%, ₦40,000 per system, booked.
const base: ForecastScenario = {
  years: 10,
  newPerMonthYear1: 20,
  growthPerYear: 0.4,
  inflationPerYear: 0.12,
  netProfitPerSystemYear1: 413252,
  drawnPerSystemYear1: 1304950,
  tenureMonths: 12,
  overheadFixedPerMonthYear1: 4000000,
  overheadGrowthPerYear: 0.15,
  overheadPerSystemYear1: 40000,
  co2TonnesPerSystemYear: 1.5,
  mode: 'booked',
}

const close = (actual: number, expected: number, tolerance = 0.001) =>
  expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(tolerance)

describe('runForecast (booked)', () => {
  const r = runForecast(base)

  it('has one row per year and 12 per year of months', () => {
    expect(r.years).toHaveLength(10)
    expect(r.months).toHaveLength(120)
  })

  it('year 1 matches the PRD illustration exactly', () => {
    expect(r.years[0]).toMatchObject({
      year: 1,
      systems: 240,
      contribution: 99180480,
      overheads: 57600000,
      netProfit: 41580480,
    })
  })

  it('year 5: about ₦458m net profit and ₦1.9bn of funder money', () => {
    close(r.years[4]!.netProfit, 457546650)
    close(r.years[4]!.capitalNeeded, 1893168836)
    close(r.years[4]!.systems, 921.984)
  })

  it('year 10: about ₦5bn net profit and ₦17.9bn of funder money', () => {
    close(r.years[9]!.netProfit, 4963629556)
    close(r.years[9]!.capitalNeeded, 17944015618)
  })

  it('cumulative net is the running sum; peak capital is the last year when growing', () => {
    let sum = 0
    for (const y of r.years) {
      sum += y.netProfit
      close(y.cumulativeNet, sum, 1e-9)
    }
    expect(r.peakCapitalYear).toBe(10)
  })

  it('profit is booked in the month installed, so month 1 already breaks even', () => {
    expect(r.breakEvenMonth).toBe(1)
  })

  it('CO₂: installed base × tonnes per system per year, monthly and cumulative', () => {
    // Month 1 has 20 systems → 20 × 1.5 ÷ 12 tonnes; year 1 sums 20, 40 … 240 systems.
    close(r.months[0]!.co2Tonnes, (20 * 1.5) / 12, 1e-9)
    close(r.years[0]!.co2Tonnes, ((20 * (12 * 13)) / 2) * (1.5 / 12), 1e-9)
    close(r.years[1]!.cumulativeCo2Tonnes, r.years[0]!.co2Tonnes + r.years[1]!.co2Tonnes, 1e-9)
  })
})

describe('runForecast (cash)', () => {
  const booked = runForecast(base)
  const cash = runForecast({ ...base, mode: 'cash' })

  it('profit arrives over the tenure, so year 1 is lower and the 10-year total too', () => {
    expect(cash.years[0]!.netProfit).toBeLessThan(booked.years[0]!.netProfit)
    expect(cash.years[9]!.cumulativeNet).toBeLessThan(booked.years[9]!.cumulativeNet)
    // The last cohorts' profit is still to come after the horizon.
    expect(cash.years[0]!.contribution).toBeCloseTo((20 * 413252 * (12 * 13)) / 2 / 12, 0)
  })

  it('month 1 does not break even in cash terms; a later month does', () => {
    expect(cash.months[0]!.netProfit).toBeLessThan(0)
    expect(cash.breakEvenMonth).toBeGreaterThan(1)
    const m = cash.breakEvenMonth!
    expect(cash.months[m - 1]!.cumulativeNet).toBeGreaterThanOrEqual(0)
    expect(cash.months[m - 2]!.cumulativeNet).toBeLessThan(0)
  })

  it('capital needed and overheads do not depend on the mode', () => {
    expect(cash.years.map((y) => y.capitalNeeded)).toEqual(booked.years.map((y) => y.capitalNeeded))
    expect(cash.years.map((y) => y.overheads)).toEqual(booked.years.map((y) => y.overheads))
  })
})

describe('sensitivity', () => {
  const r = runForecast(base)

  it('an extra default rate loses that share of the money drawn on every system', () => {
    const d = runForecast({ ...base, defaultRateExtra: 0.05 })
    close(r.years[0]!.netProfit - d.years[0]!.netProfit, 240 * 1304950 * 0.05, 1e-9)
    expect(d.years[0]!.capitalNeeded).toBe(r.years[0]!.capitalNeeded)
  })

  it('naira devaluation (prices follow cost through the markup) raises naira profit per system and funder money needed by the same factor; overheads do not follow', () => {
    const v = runForecast({ ...base, nairaDevaluationPerYear: 0.2 })
    // Year 1 is today's prices: no change.
    expect(v.years[0]).toEqual(r.years[0])
    // Year 2: contribution and capital × 1.2, overheads unchanged.
    close(v.years[1]!.contribution, r.years[1]!.contribution * 1.2, 1e-9)
    close(v.years[1]!.capitalNeeded, r.years[1]!.capitalNeeded * 1.2, 1e-9)
    expect(v.years[1]!.overheads).toBe(r.years[1]!.overheads)
    expect(v.years[1]!.netProfit).toBeGreaterThan(r.years[1]!.netProfit)
    expect(v.years[1]!.capitalNeeded).toBeGreaterThan(r.years[1]!.capitalNeeded)
  })

  it('a horizon of 1 to 10 years', () => {
    expect(runForecast({ ...base, years: 1 }).years).toHaveLength(1)
    expect(() => runForecast({ ...base, years: 0 })).toThrow()
    expect(() => runForecast({ ...base, years: 11 })).toThrow()
  })
})

describe('breakEvenSystemsPerYear', () => {
  it('fixed overheads ÷ (net profit − cost per system): about 129 a year in the PRD example', () => {
    expect(breakEvenSystemsPerYear(48000000, 413252, 40000)).toBeCloseTo(128.6, 1)
  })
  it('null when each system loses money', () => {
    expect(breakEvenSystemsPerYear(48000000, 30000, 40000)).toBeNull()
  })
})
