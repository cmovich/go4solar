import type { LoadTotals } from '@/lib/load/types'
import type { NgStateId } from '@/lib/nigeria/states'
import { priceQuote } from '@/lib/pricing/price'
import { installBandFor } from '@/lib/pricing/tables'
import { offeredTenures } from '@/lib/pricing/tenures'
import { autoPickAccessories, type CatalogueItem } from '@/lib/catalogue/autopick'
import { installationCost, logisticsFor, rackLine } from '@/lib/catalogue/extras'
import { DEFAULT_WIRING, wireEstimate, type SiteAnswers } from '@/lib/wizard/questions'
import {
  type NoMarkupLine,
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

/**
 * Part F: what the catalogue adds to an auto quote. Itemised accessories (once any are switched
 * on) replace the old pack; the rack the customer asked for; installation with the roof and
 * height extras; delivery. Without the catalogue: nothing (the price list's pack and one
 * installation amount, as before).
 */
export function catalogueExtras(
  size: SystemSize,
  state: NgStateId,
  site: SiteAnswers,
  s: QuoteSettings,
  baseLines: QuoteLineInput[],
): { lines: QuoteLineInput[]; noMarkup?: NoMarkupLine[] } {
  const cat = s.catalogue
  if (!cat) return { lines: baseLines }
  let lines = baseLines
  const itemised = cat.accessories.filter((a) => a.kind !== 'pack') as CatalogueItem[]
  if (itemised.length > 0 && (cat.rules?.length ?? 0) > 0) {
    const wire = site.wire?.known
      ? { dcMetres: site.wire.dcMetres ?? 0, acMetres: site.wire.acMetres ?? 0 }
      : wireEstimate({ ...site, wire: undefined }, s.wiring ?? DEFAULT_WIRING)!
    const panel = equipmentFromPriceList(s.priceList).panel
    const layout = size.stringLayout ?? { series: 1, strings: 1 }
    const picks = autoPickAccessories(
      {
        inverterKva: size.inverterKva,
        dcRunM: wire.dcMetres / 2,
        dcWireM: wire.dcMetres,
        acRunM: wire.acMetres,
        stringCurrentA: (panel.watts / panel.vmp) * layout.strings,
        stringVoltageV: panel.vmp * layout.series,
        maxDrop: cat.settings.maxDcVoltageDrop,
      },
      cat.rules ?? [],
      itemised,
    )
    lines = [
      ...baseLines.filter((l) => l.category !== 'accessories'),
      ...picks.map((p) => ({
        sku: p.sku,
        name: p.name,
        category: 'accessories' as const,
        unitCost: p.unitCost,
        qty: p.qty,
      })),
    ]
  }
  const material = site.rack?.wanted ? (site.rack.material ?? null) : null
  const rack = rackLine({
    panels: size.panelCount,
    panelLengthCm: cat.panelLengthCm,
    material,
    mounting: site.mounting,
    pricePerCm: material ? (cat.rackPrices[material] ?? 0) : 0,
    railsPerPanel: cat.settings.railsPerPanel,
    clampPricePerPanel: cat.settings.clampPricePerPanel,
  })
  if (rack) lines = [...lines, rack]

  const roof = cat.roofTypes.find((r) => r.id === site.roofTypeId) ?? null
  const b = site.building
  const install = installationCost({
    installer: 'go4solar',
    baseCost: installCostFor(state, size.inverterKva, s.priceList),
    roof: site.mounting === 'roof' && roof ? { price: roof.price, unit: roof.unit } : null,
    panels: size.panelCount,
    panelKw: size.panelKw,
    storeysAbove:
      b && (!site.mounting || site.mounting === 'roof')
        ? b.unit === 'feet'
          ? Math.round(b.height / 9.84)
          : b.height
        : 0,
    extraPerStorey: cat.settings.extraPerStorey,
  })
  const noMarkup: NoMarkupLine[] = [{ label: 'Installation', amount: install }]
  const delivery = logisticsFor(state, size.panelCount, cat.logistics)
  if (delivery) noMarkup.push({ label: delivery.label, amount: delivery.amount })
  return { lines, noMarkup: noMarkup.filter((l) => l.amount > 0) }
}

function priceLines(
  lines: QuoteLineInput[],
  state: NgStateId,
  inverterKva: number,
  depositShare: number,
  s: QuoteSettings,
  noMarkup?: NoMarkupLine[],
): QuoteResult {
  return priceQuote({
    lines,
    installCost: noMarkup
      ? noMarkup.reduce((sum, l) => sum + l.amount, 0)
      : installCostFor(state, inverterKva, s.priceList),
    noMarkup,
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
  site: SiteAnswers = {},
): Estimate {
  const sun = s.sunHours?.[state] ?? DEFAULT_SUN_HOURS
  const equipment = equipmentFromPriceList(s.priceList)
  const plans = Object.fromEntries(
    PLANS.map((plan) => {
      const size = sizeSystem(totals, plan, s.sizing, { sun, grid, equipment })
      const extras = catalogueExtras(size, state, site, s, linesFor(size, s.priceList))
      const quote = priceLines(
        extras.lines,
        state,
        size.inverterKva,
        depositShare,
        s,
        extras.noMarkup,
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
      noMarkup: snap.noMarkup,
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
      noMarkup: snap.noMarkup,
      marginByCategory: snap.marginByCategory,
      pricingRateAnnual: rates?.[tenureMonths] ?? snap.pricingRateAnnual,
      tenureMonths,
      depositShare: snap.depositShare,
      minDepositShare: snap.minDepositShare,
    }).monthly,
  }))
}
