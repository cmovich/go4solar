import type { LoadTotals } from '@/lib/load/types'
import { priceQuote } from '@/lib/pricing/price'
import type { QuoteLineInput, QuoteResult } from '@/lib/pricing/types'
import type { PriceList, QuoteSettings } from '@/lib/settings/schemas'
import { sizeSystem } from '@/lib/sizing/size'
import type { Plan, SystemSize } from '@/lib/sizing/types'

export const PLANS: readonly Plan[] = ['essential', 'comfort', 'independence']

export const PLAN_LABELS: Record<Plan, string> = {
  essential: 'Essential',
  comfort: 'Comfort',
  independence: '24-Hour Independence',
}

/** Where the system will be installed. 'Other' measures demand outside the launch states. */
export type EstimateState = 'FCT' | 'Kaduna' | 'Lagos' | 'Other'

export const ESTIMATE_TENURE = 12 as const

export type PlanEstimate = {
  plan: Plan
  size: SystemSize
  quote: QuoteResult
}

export type Estimate = {
  version: 1
  state: EstimateState
  depositShare: number
  tenureMonths: typeof ESTIMATE_TENURE
  /** True when sample (placeholder) prices were used. */
  sample: boolean
  plans: Record<Plan, PlanEstimate>
}

export type RepricedPlan = PlanEstimate & {
  /** System price at the minimum deposit minus the price at this deposit. */
  savingVsMin: number
}

/** 'Other' is sized with FCT sun hours — the middle of the three launch states. */
function sizingState(state: EstimateState): 'FCT' | 'Kaduna' | 'Lagos' {
  return state === 'Other' ? 'FCT' : state
}

/** Equipment lines for a sized system, from the admin price list. */
export function linesFor(size: SystemSize, priceList: PriceList): QuoteLineInput[] {
  const inverter =
    [...priceList.inverters].sort((a, b) => a.kva - b.kva).find((i) => i.kva >= size.inverterKva) ??
    priceList.inverters[priceList.inverters.length - 1]!
  const accessories =
    [...priceList.accessoriesByKva]
      .sort((a, b) => a.maxKva - b.maxKva)
      .find((t) => size.inverterKva <= t.maxKva) ??
    priceList.accessoriesByKva[priceList.accessoriesByKva.length - 1]!
  const modules = Math.max(1, Math.round(size.batteryKwh / priceList.batteryModule.kwh))

  return [
    {
      sku: priceList.panel.sku,
      name: priceList.panel.name,
      category: 'panels',
      unitCost: priceList.panel.unitCost,
      qty: size.panelCount,
    },
    {
      sku: priceList.batteryModule.sku,
      name: priceList.batteryModule.name,
      category: 'battery',
      unitCost: priceList.batteryModule.unitCost,
      qty: modules,
    },
    {
      sku: inverter.sku,
      name: inverter.name,
      category: 'inverter',
      unitCost: inverter.unitCost,
      qty: 1,
    },
    {
      sku: `ACC-${accessories.maxKva}`,
      name: 'Protection, cables and mounting',
      category: 'accessories',
      unitCost: accessories.unitCost,
      qty: 1,
    },
  ]
}

function priceLines(
  lines: QuoteLineInput[],
  state: EstimateState,
  depositShare: number,
  s: QuoteSettings,
): QuoteResult {
  return priceQuote({
    lines,
    installCost: s.priceList.installByState[state],
    marginByCategory: s.pricing.marginByCategory,
    pricingRateAnnual: s.pricing.pricingRateAnnual,
    tenureMonths: ESTIMATE_TENURE,
    depositShare,
    minDepositShare: s.minDepositShare,
  })
}

/**
 * The three waiting-list plans for a load: size each with the sizing engine, build equipment
 * lines from the price list, and price at 12 months. Pure: no database access.
 */
export function buildEstimate(
  totals: LoadTotals,
  state: EstimateState,
  depositShare: number,
  s: QuoteSettings,
): Estimate {
  const plans = Object.fromEntries(
    PLANS.map((plan) => {
      const size = sizeSystem(totals, plan, sizingState(state), s.sizing)
      const quote = priceLines(linesFor(size, s.priceList), state, depositShare, s)
      return [plan, { plan, size, quote }]
    }),
  ) as Record<Plan, PlanEstimate>

  return {
    version: 1,
    state,
    depositShare,
    tenureMonths: ESTIMATE_TENURE,
    sample: s.priceList.sample || s.pricing.sample,
    plans,
  }
}

/**
 * Re-price one plan of an existing estimate at a different deposit (the contribution slider).
 * The sizing never changes; only the price. Uses the snapshot in the plan's quote, so the
 * figures stay consistent with what the user was first shown.
 */
export function repriceEstimate(
  estimate: Estimate,
  plan: Plan,
  depositShare: number,
): RepricedPlan {
  const base = estimate.plans[plan]
  const snap = base.quote.snapshot
  const quote = priceQuote({
    lines: snap.lines,
    installCost: snap.installCost,
    marginByCategory: snap.marginByCategory,
    pricingRateAnnual: snap.pricingRateAnnual,
    tenureMonths: snap.tenureMonths,
    depositShare,
    minDepositShare: snap.minDepositShare,
  })
  const atMin =
    depositShare === snap.minDepositShare
      ? quote
      : priceQuote({
          lines: snap.lines,
          installCost: snap.installCost,
          marginByCategory: snap.marginByCategory,
          pricingRateAnnual: snap.pricingRateAnnual,
          tenureMonths: snap.tenureMonths,
          depositShare: snap.minDepositShare,
          minDepositShare: snap.minDepositShare,
        })
  return { ...base, quote, savingVsMin: atMin.systemPrice - quote.systemPrice }
}
