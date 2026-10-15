import { describe, expect, it } from 'vitest'

import { DEFAULT_ENERGY_SETTINGS, type EnergySettings } from '@/lib/settings/schemas'

import { co2Avoided, currentEnergy, recommendTenure } from './currentSpend'

// Round numbers so every expectation can be checked by hand.
const s: EnergySettings = {
  sample: true,
  fuelPricePerLitre: { petrol: 1000, diesel: 1200 },
  emissionFactorKgPerLitre: { petrol: 2.31, diesel: 2.66 },
  grid: { tariffPerKwh: 210, factorKgPerKwh: 0.4, verified: false },
}

describe('currentEnergy — worked examples', () => {
  it('petrol generator: ₦12,000 fuel + ₦4,200 grid a week', () => {
    const c = currentEnergy(
      { generator: 'petrol', weeklyFuelNaira: 12000, weeklyGridNaira: 4200 },
      s,
    )
    // (12,000 + 4,200) × 52 / 12 = 70,200
    expect(c.monthlySpend).toBe(70200)
    // 12,000 × 52 = 624,000 ÷ ₦1,000/L = 624 L
    expect(c.litresPerYear).toBe(624)
    // 624 L × 2.31 = 1,441.44 kg
    expect(c.fuelCo2KgPerYear).toBeCloseTo(1441.44, 2)
    // 4,200 × 52 = 218,400 ÷ ₦210/kWh = 1,040 kWh
    expect(c.gridKwhPerYear).toBe(1040)
    // 1,040 × 0.40 = 416 kg
    expect(c.gridCo2KgPerYear).toBeCloseTo(416, 6)
  })

  it('diesel generator uses the diesel price and factor', () => {
    const c = currentEnergy({ generator: 'diesel', weeklyFuelNaira: 12000, weeklyGridNaira: 0 }, s)
    expect(c.litresPerYear).toBe(520) // 624,000 ÷ 1,200
    expect(c.fuelCo2KgPerYear).toBeCloseTo(520 * 2.66, 6)
    expect(c.gridKwhPerYear).toBe(0)
    expect(c.gridCo2KgPerYear).toBe(0)
  })

  it('"both" splits the fuel spend 50/50 unless a petrol share is given', () => {
    const half = currentEnergy({ generator: 'both', weeklyFuelNaira: 12000, weeklyGridNaira: 0 }, s)
    // 312,000 ÷ 1,000 = 312 L petrol + 312,000 ÷ 1,200 = 260 L diesel
    expect(half.litresPerYear).toBe(572)
    expect(half.fuelCo2KgPerYear).toBeCloseTo(312 * 2.31 + 260 * 2.66, 6)

    const mostlyPetrol = currentEnergy(
      {
        generator: 'both',
        weeklyFuelNaira: 12000,
        weeklyGridNaira: 0,
        fuelMix: { petrolShare: 0.75 },
      },
      s,
    )
    // 468,000 ÷ 1,000 = 468 L petrol + 156,000 ÷ 1,200 = 130 L diesel
    expect(mostlyPetrol.litresPerYear).toBe(598)
  })

  it('no generator: fuel spend is ignored, only the grid counts', () => {
    const c = currentEnergy({ generator: 'none', weeklyFuelNaira: 5000, weeklyGridNaira: 4200 }, s)
    expect(c.litresPerYear).toBe(0)
    expect(c.fuelCo2KgPerYear).toBe(0)
    expect(c.gridKwhPerYear).toBe(1040)
    // Spend still counts what they told us they pay.
    expect(c.monthlySpend).toBe(Math.round((5000 + 4200) * (52 / 12)))
  })

  it('rounds money to whole naira and never returns negatives', () => {
    const c = currentEnergy(
      { generator: 'petrol', weeklyFuelNaira: 1000, weeklyGridNaira: 1000 },
      s,
    )
    expect(Number.isInteger(c.monthlySpend)).toBe(true)
    expect(c.monthlySpend).toBe(8667) // 2,000 × 52 / 12 = 8,666.67
    const zero = currentEnergy({ generator: 'petrol', weeklyFuelNaira: 0, weeklyGridNaira: 0 }, s)
    expect(zero).toEqual({
      monthlySpend: 0,
      litresPerYear: 0,
      fuelCo2KgPerYear: 0,
      gridKwhPerYear: 0,
      gridCo2KgPerYear: 0,
    })
  })

  it('ships with seeded defaults that match the migration', () => {
    expect(DEFAULT_ENERGY_SETTINGS.emissionFactorKgPerLitre).toEqual({ petrol: 2.31, diesel: 2.66 })
    expect(DEFAULT_ENERGY_SETTINGS.grid.factorKgPerKwh).toBe(0.4)
    expect(DEFAULT_ENERGY_SETTINGS.grid.verified).toBe(false)
    expect(DEFAULT_ENERGY_SETTINGS.sample).toBe(true)
  })
})

describe('co2Avoided', () => {
  const current = currentEnergy(
    { generator: 'petrol', weeklyFuelNaira: 12000, weeklyGridNaira: 4200 },
    s,
  )

  it('every plan avoids the generator fuel CO₂', () => {
    expect(co2Avoided('essential', current)).toBeCloseTo(1441.44, 2)
    expect(co2Avoided('comfort', current)).toBeCloseTo(1441.44, 2)
  })

  it('only independence also avoids the grid CO₂', () => {
    expect(co2Avoided('independence', current)).toBeCloseTo(1441.44 + 416, 2)
  })
})

describe('recommendTenure', () => {
  const prices = [
    { tenureMonths: 3 as const, monthly: 560224 },
    { tenureMonths: 6 as const, monthly: 294985 },
    { tenureMonths: 9 as const, monthly: 207684 },
    { tenureMonths: 12 as const, monthly: 165017 },
  ]

  it('picks the shortest tenure whose monthly fits today’s spend', () => {
    expect(recommendTenure(prices, 300000)).toBe(6)
    expect(recommendTenure(prices, 294985)).toBe(6) // at or below counts
    expect(recommendTenure(prices, 210000)).toBe(9)
    expect(recommendTenure(prices, 600000)).toBe(3)
  })

  it('returns null when even the longest tenure costs more than today (suggest a higher deposit)', () => {
    expect(recommendTenure(prices, 70200)).toBeNull()
    expect(recommendTenure(prices, 0)).toBeNull()
  })

  it('does not depend on the order of the rows', () => {
    expect(recommendTenure([...prices].reverse(), 300000)).toBe(6)
  })
})
