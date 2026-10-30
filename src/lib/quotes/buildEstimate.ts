import type { LoadTotals } from '@/lib/load/types'
import type { NgStateId } from '@/lib/nigeria/states'
import { priceQuote } from '@/lib/pricing/price'
import { installBandFor } from '@/lib/pricing/tables'
import { offeredTenures } from '@/lib/pricing/tenures'
import {
  type QuoteLineInput,
  type QuoteResult,
  type RateByTenure,
  type TenureMonths,
} from '@/lib/pricing/types'
import { DEFAULT_SUN_HOURS, type PriceList, type QuoteSettings } from '@/lib/settings/schemas'
import { equipmentFrom } from '@/lib/sizing/equipment'
import { sizeSystem } from '@/lib/sizing/size'
import type { Equipment, GridInput, Plan, SunHours, SystemSize } from '@/lib/sizing/types'

export const PLANS: readonly Plan[] = ['essential', 'comfort', 'independence']

export const PLAN_LABELS: Record<Plan, string> = {
  essential: 'Essential',
  comfort: 'Comfort',
  independence: '24-Hour Independence',
}

export const ESTIMATE_TENURE = 12 as const

export type PlanEstimate = {
  plan: Plan
  size: SystemSize
  quote: QuoteResult
}

export type Estimate = {
  version: 1
  /** Grid supply the plans were sized with (null/missing = no grid). */
  grid?: GridInput | null
  /** Sun hours of the state at the time (Part B). */
  sun?: SunHours
  /** State of installation (any of the 36 states or FCT). */
  state: NgStateId
  depositShare: number
  tenureMonths: typeof ESTIMATE_TENURE
  /** True when sample (placeholder) prices were used. */
  sample: boolean
  /**
   * Pricing rate per tenure at the time of the estimate: only the tenures switched on then.
   * This is the estimate's snapshot of which payment-plan lengths it offers.
   */
  pricingRateByTenure: RateByTenure
  plans: Record<Plan, PlanEstimate>
  /** When the estimate was priced (ISO). Set by the server action that stores it. */
  pricedAt?: string
}

export type RepricedPlan = PlanEstimate & {
  /** System price at the minimum deposit minus the price at this deposit. */
  savingVsMin: number
}

/**
 * Installation and logistics: the state's own price (set in /admin/pricing), else "Other";
 * within a state the amount depends on the inverter size band.
 */
export function installCostFor(
  state: NgStateId,
  inverterKva: number,
  priceList: PriceList,
): number {
  const byBand = priceList.installByState[state] ?? priceList.installByState.Other
  return byBand[installBandFor(inverterKva)]
}

/** What the sizing engine needs from the price list (specs, assumed where missing). */
export function equipmentFromPriceList(priceList: PriceList): Equipment {
  return equipmentFrom({
    inverters: priceList.inverters.map((i) => ({
      sku: i.sku,
      kva: i.kva,
      nominalVoltage: i.nominalVoltage ?? null,
      specs: i.specs ?? {},
    })),
    panel: {
      sku: priceList.panel.sku,
      watts: priceList.panel.watts,
      specs: priceList.panel.specs ?? {},
    },
    batteries: (priceList.batteries ?? []).map((b) => ({
      sku: b.sku,
      kwh: b.kwh,
      unitCost: b.unitCost,
      nominalVoltage: b.nominalVoltage ?? null,
      specs: b.specs ?? {},
    })),
  })
}

/** Equipment lines for a sized system, from the admin price list. */
export function linesFor(size: SystemSize, priceList: PriceList): QuoteLineInput[] {
  const inverter =
    priceList.inverters.find((i) => i.sku === size.inverterSku) ??
    [...priceList.inverters].sort((a, b) => a.kva - b.kva).find((i) => i.kva >= size.inverterKva) ??
    priceList.inverters[priceList.inverters.length - 1]!
  const accessories =
    [...priceList.accessoriesByKva]
      .sort((a, b) => a.maxKva - b.maxKva)
      .find((t) => size.inverterKva <= t.maxKva) ??
    priceList.accessoriesByKva[priceList.accessoriesByKva.length - 1]!
  // A battery picked from the catalogue (Part B), else whole modules of the default battery.
  const picked = size.battery?.sku
    ? priceList.batteries?.find((b) => b.sku === size.battery!.sku)
    : undefined
  const batteryLine = picked ?? priceList.batteryModule
  const modules = picked
    ? size.battery!.modules
    : Math.max(1, Math.round(size.batteryKwh / priceList.batteryModule.kwh))

  return [
    {
      sku: priceList.panel.sku,
      name: priceList.panel.name,
      category: 'panels',
      unitCost: priceList.panel.unitCost,
      qty: size.panelCount,
    },
    {
      sku: batteryLine.sku,
      name: batteryLine.name,
      category: 'battery',
      unitCost: batteryLine.unitCost,
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
  state: NgStateId,
  inverterKva: number,
  depositShare: number,
  s: QuoteSettings,
): QuoteResult {
  return priceQuote({
    lines,
    installCost: installCostFor(state, inverterKva, s.priceList),
    marginByCategory: s.pricing.marginByCategory,
    pricingRateAnnual: s.pricing.pricingRateByTenure[ESTIMATE_TENURE],
    tenureMonths: ESTIMATE_TENURE,
    depositShare,
    minDepositShare: s.minDepositShare,
  })
}

/**
 * The three plans for a load: size each with the sizing engine (the state's sun hours, the grid
 * supply if known, the price list's equipment), build equipment lines from the price list, and
 * price at 12 months. Pure: no database access.
 */
export function buildEstimate(
  totals: LoadTotals,
  state: NgStateId,
  depositShare: number,
  s: QuoteSettings,
  grid: GridInput | null = null,
): Estimate {
  const sun = s.sunHours?.[state] ?? DEFAULT_SUN_HOURS
  const equipment = equipmentFromPriceList(s.priceList)
  const plans = Object.fromEntries(
    PLANS.map((plan) => {
      const size = sizeSystem(totals, plan, s.sizing, { sun, grid, equipment })
      const quote = priceLines(
        linesFor(size, s.priceList),
        state,
        size.inverterKva,
        depositShare,
        s,
      )
      return [plan, { plan, size, quote }]
    }),
  ) as Record<Plan, PlanEstimate>

  return {
    version: 1,
    grid,
    sun,
    state,
    depositShare,
    tenureMonths: ESTIMATE_TENURE,
    sample: s.priceList.sample || s.pricing.sample,
    pricingRateByTenure: { ...s.pricing.pricingRateByTenure },
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
  const at = (share: number) =>
    priceQuote({
      lines: snap.lines,
      installCost: snap.installCost,
      marginByCategory: snap.marginByCategory,
      pricingRateAnnual: snap.pricingRateAnnual,
      tenureMonths: snap.tenureMonths,
      depositShare: share,
      minDepositShare: snap.minDepositShare,
    })
  const quote = at(depositShare)
  const atMin = depositShare === snap.minDepositShare ? quote : at(snap.minDepositShare)
  return { ...base, quote, savingVsMin: atMin.systemPrice - quote.systemPrice }
}

/**
 * Monthly payment for a plan at each tenure, at the deposit it was priced with. Uses the
 * per-tenure pricing rates captured in the estimate when given (else the snapshot's rate).
 */
export function monthlyByTenure(
  plan: PlanEstimate,
  rates?: RateByTenure,
  tenures: readonly TenureMonths[] = offeredTenures(rates),
): { tenureMonths: TenureMonths; monthly: number }[] {
  const snap = plan.quote.snapshot
  return tenures.map((tenureMonths) => ({
    tenureMonths,
    monthly: priceQuote({
      lines: snap.lines,
      installCost: snap.installCost,
      marginByCategory: snap.marginByCategory,
      pricingRateAnnual: rates?.[tenureMonths] ?? snap.pricingRateAnnual,
      tenureMonths,
      depositShare: snap.depositShare,
      minDepositShare: snap.minDepositShare,
    }).monthly,
  }))
}
