import { roundNaira } from '@/lib/money'
import type { TenureMonths } from '@/lib/pricing/types'
import type { EnergySettings } from '@/lib/settings/schemas'
import type { Plan } from '@/lib/sizing/types'

export const GENERATOR_TYPES = ['none', 'petrol', 'diesel', 'both'] as const
export type GeneratorType = (typeof GENERATOR_TYPES)[number]
export const GENERATOR_LABELS: Record<GeneratorType, string> = {
  none: 'No generator',
  petrol: 'Petrol generator',
  diesel: 'Diesel generator',
  both: 'Petrol and diesel',
}

export type CurrentEnergyInput = {
  generator: GeneratorType
  /** What they spend on generator fuel in a typical week, naira. */
  weeklyFuelNaira: number
  /** What they spend on grid (NEPA) bills in a typical week, naira. */
  weeklyGridNaira: number
  /** For 'both': share of the fuel money that goes on petrol (default 0.5). */
  fuelMix?: { petrolShare: number }
}

export type CurrentEnergy = {
  /** Fuel + grid, per month (whole naira). */
  monthlySpend: number
  litresPerYear: number
  fuelCo2KgPerYear: number
  gridKwhPerYear: number
  gridCo2KgPerYear: number
}

const WEEKS_PER_YEAR = 52
const MONTHS_PER_YEAR = 12

/**
 * What the customer pays for power today, and the carbon behind it.
 * Spend counts whatever they told us; litres and CO₂ follow the generator type.
 */
export function currentEnergy(input: CurrentEnergyInput, s: EnergySettings): CurrentEnergy {
  const weeklyFuel = Math.max(0, input.weeklyFuelNaira)
  const weeklyGrid = Math.max(0, input.weeklyGridNaira)
  const yearlyFuel = weeklyFuel * WEEKS_PER_YEAR
  const yearlyGrid = weeklyGrid * WEEKS_PER_YEAR

  let petrolNaira = 0
  let dieselNaira = 0
  if (input.generator === 'petrol') petrolNaira = yearlyFuel
  else if (input.generator === 'diesel') dieselNaira = yearlyFuel
  else if (input.generator === 'both') {
    const share = Math.min(1, Math.max(0, input.fuelMix?.petrolShare ?? 0.5))
    petrolNaira = yearlyFuel * share
    dieselNaira = yearlyFuel * (1 - share)
  }

  const petrolLitres = petrolNaira / s.fuelPricePerLitre.petrol
  const dieselLitres = dieselNaira / s.fuelPricePerLitre.diesel
  const fuelCo2KgPerYear =
    petrolLitres * s.emissionFactorKgPerLitre.petrol +
    dieselLitres * s.emissionFactorKgPerLitre.diesel

  const gridKwhPerYear = yearlyGrid / s.grid.tariffPerKwh

  return {
    monthlySpend: roundNaira(((weeklyFuel + weeklyGrid) * WEEKS_PER_YEAR) / MONTHS_PER_YEAR),
    litresPerYear: petrolLitres + dieselLitres,
    fuelCo2KgPerYear,
    gridKwhPerYear,
    gridCo2KgPerYear: gridKwhPerYear * s.grid.factorKgPerKwh,
  }
}

/**
 * CO₂ a plan avoids per year, kg: every plan replaces the generator; only the 24-hour
 * independence plan also replaces the grid.
 */
export function co2Avoided(plan: Plan, current: CurrentEnergy): number {
  return current.fuelCo2KgPerYear + (plan === 'independence' ? current.gridCo2KgPerYear : 0)
}

export type TenurePrice = { tenureMonths: TenureMonths; monthly: number }

/**
 * The shortest tenure whose monthly payment is at or below today's monthly spend — the plan
 * "pays for itself". null when even the longest tenure costs more (suggest a higher deposit).
 */
export function recommendTenure(prices: TenurePrice[], monthlySpend: number): TenureMonths | null {
  const fits = prices
    .filter((p) => p.monthly <= monthlySpend)
    .sort((a, b) => a.tenureMonths - b.tenureMonths)
  return fits[0]?.tenureMonths ?? null
}
