import { makeItem, sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadTotals } from '@/lib/load/types'
import type { NgStateId } from '@/lib/nigeria/states'
import { loanProfit } from '@/lib/profit/loanProfit'
import type { LoanProfit, UnitCosts } from '@/lib/profit/types'
import { equipmentFromPriceList, installCostFor, linesFor } from '@/lib/quotes/buildEstimate'
import { DEFAULT_SUN_HOURS, type QuoteSettings } from '@/lib/settings/schemas'
import { sizeSystem } from '@/lib/sizing/size'
import type { GridInput, Plan, SystemSize } from '@/lib/sizing/types'

import { priceQuote } from './price'
import { offeredTenures } from './tenures'
import type { ComponentCategory, QuoteResult, TenureMonths } from './types'

export type PreviewFunder = {
  id: string
  name: string
  annualRate: number
  /** Longest tenure this funder lends for; longer plans cannot use it. */
  maxTenure: TenureMonths
  status: 'active' | 'paused'
}

/** One switched-on tenure in the preview, with the most profitable funder that lends for it. */
export type PreviewTenure = {
  tenureMonths: TenureMonths
  systemPrice: number
  monthly: number
  /** null when no active funder lends for this long (the plan cannot be funded). */
  funder: { id: string; name: string; annualRate: number; profit: LoanProfit } | null
}

export type PreviewInput = {
  settings: QuoteSettings
  totals: LoadTotals
  state: NgStateId
  plan: Plan
  tenureMonths: TenureMonths
  depositShare: number
  funders: PreviewFunder[]
  unitCosts: UnitCosts
  /** Grid supply to test with (null = no grid). */
  grid?: GridInput | null
}

export type PreviewLine = {
  sku: string
  name: string
  category: ComponentCategory
  unitCost: number
  qty: number
  lineCost: number
  markupShare: number
  unitPrice: number
  lineTotal: number
}

export type Preview = {
  size: SystemSize
  lines: PreviewLine[]
  installCost: number
  costPrice: number
  markupShare: number
  systemPrice: number
  deposit: number
  balance: number
  monthly: number
  /** Go4Solar's side with each ACTIVE funder that lends for the chosen tenure. */
  funders: { id: string; name: string; annualRate: number; profit: LoanProfit }[]
  /** Every switched-on tenure: monthly payment, net profit and return. */
  tenures: PreviewTenure[]
  /** System price as the deposit moves from 20% to 95%. */
  curve: { depositPct: number; systemPrice: number; monthly: number }[]
  quote: QuoteResult
}

/** Sample packages for the price preview (loads only; prices come from the draft). */
export const SAMPLE_PACKAGES: { id: string; label: string; totals: LoadTotals }[] = [
  { id: 'small-home', label: 'Small home · 480 W', totals: computeLoadTotals(sampleHomeItems) },
  {
    id: 'family-home',
    // Semako's test home: 2,000 W, 1,000 W of it essential, 6 h in the day and 6 h at night.
    label: 'Family home · 2 kW',
    totals: computeLoadTotals([
      makeItem({
        id: 'ess',
        category: 'cooling',
        name: 'Essential items',
        watts: 1000,
        essential: true,
        dayHours: 6,
        nightHours: 6,
        hoursPerDay: 12,
      }),
      makeItem({
        id: 'rest',
        category: 'cooling',
        name: 'Other items',
        watts: 1000,
        dayHours: 6,
        nightHours: 6,
        hoursPerDay: 12,
      }),
    ]),
  },
  {
    id: 'shop',
    label: 'Shop · 3.5 kW',
    totals: computeLoadTotals([
      makeItem({
        id: 'fr',
        category: 'business',
        name: 'Commercial freezer',
        watts: 400,
        qty: 2,
        surgeFactor: 3,
        dutyCycle: 0.4,
        essential: true,
        dayHours: 12,
        nightHours: 12,
        hoursPerDay: 24,
      }),
      makeItem({
        id: 'ac',
        category: 'cooling',
        name: 'AC 1.5 HP',
        watts: 1300,
        surgeFactor: 3,
        dutyCycle: 0.5,
        dayHours: 8,
        nightHours: 0,
        hoursPerDay: 8,
      }),
      makeItem({
        id: 'eq',
        category: 'business',
        name: 'Shop equipment',
        watts: 1400,
        dayHours: 8,
        nightHours: 2,
        hoursPerDay: 10,
      }),
    ]),
  },
]

function priceAt(
  input: PreviewInput,
  size: SystemSize,
  depositShare: number,
  tenureMonths: TenureMonths = input.tenureMonths,
): QuoteResult {
  const { settings: s } = input
  const rate = s.pricing.pricingRateByTenure[tenureMonths]
  if (rate === undefined) throw new Error(`${tenureMonths} months is switched off`)
  return priceQuote({
    lines: linesFor(size, s.priceList),
    installCost: installCostFor(input.state, size.inverterKva, s.priceList),
    marginByCategory: s.pricing.marginByCategory,
    pricingRateAnnual: rate,
    tenureMonths,
    depositShare,
    minDepositShare: s.minDepositShare,
  })
}

/** Go4Solar's side of a quote with each active funder that lends for its tenure. */
function sideWith(input: PreviewInput, quote: QuoteResult, tenureMonths: TenureMonths) {
  return input.funders
    .filter((f) => f.status === 'active' && f.maxTenure >= tenureMonths)
    .map((f) => ({
      id: f.id,
      name: f.name,
      annualRate: f.annualRate,
      profit: loanProfit({
        systemPrice: quote.systemPrice,
        costPrice: quote.costPrice,
        deposit: quote.deposit,
        tenureMonths,
        funderAnnualRate: f.annualRate,
        funderMethod: 'flat',
        unitCosts: input.unitCosts,
      }),
    }))
}

/**
 * The admin "Price preview": the same engines the customer sees (sizing → lines → priceQuote)
 * run on DRAFT settings, plus Go4Solar's side per active funder and a price-vs-deposit curve.
 * Pure: safe to run on every keystroke.
 */
export function buildPreview(input: PreviewInput): Preview {
  const size = sizeSystem(input.totals, input.plan, input.settings.sizing, {
    sun: input.settings.sunHours?.[input.state] ?? DEFAULT_SUN_HOURS,
    grid: input.grid ?? null,
    equipment: equipmentFromPriceList(input.settings.priceList),
  })
  const quote = priceAt(input, size, input.depositShare)

  const lines: PreviewLine[] = quote.lines.map((l) => {
    const lineCost = l.unitCost * l.qty
    return {
      sku: l.sku,
      name: l.name,
      category: l.category,
      unitCost: l.unitCost,
      qty: l.qty,
      lineCost,
      markupShare: lineCost > 0 ? l.lineTotal / lineCost - 1 : 0,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    }
  })

  const funders = sideWith(input, quote, input.tenureMonths)
  const tenures: PreviewTenure[] = offeredTenures(input.settings.pricing.pricingRateByTenure).map(
    (t) => {
      const q = t === input.tenureMonths ? quote : priceAt(input, size, input.depositShare, t)
      const best = sideWith(input, q, t).sort((a, b) => b.profit.netProfit - a.profit.netProfit)[0]
      return {
        tenureMonths: t,
        systemPrice: q.systemPrice,
        monthly: q.monthly,
        funder: best ?? null,
      }
    },
  )

  const minPct = Math.max(20, Math.round(input.settings.minDepositShare * 100))
  const curve: Preview['curve'] = []
  for (let pct = minPct; pct <= 95; pct += 5) {
    const q = priceAt(input, size, pct / 100)
    curve.push({ depositPct: pct, systemPrice: q.systemPrice, monthly: q.monthly })
  }
  if (curve[curve.length - 1]?.depositPct !== 95) {
    const q = priceAt(input, size, 0.95)
    curve.push({ depositPct: 95, systemPrice: q.systemPrice, monthly: q.monthly })
  }

  return {
    size,
    lines,
    installCost: quote.installCost,
    costPrice: quote.costPrice,
    markupShare: quote.markupShare,
    systemPrice: quote.systemPrice,
    deposit: quote.deposit,
    balance: quote.balance,
    monthly: quote.monthly,
    funders,
    tenures,
    curve,
    quote,
  }
}
