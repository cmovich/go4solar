import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadTotals } from '@/lib/load/types'
import type { NgStateId } from '@/lib/nigeria/states'
import { loanProfit } from '@/lib/profit/loanProfit'
import type { LoanProfit, UnitCosts } from '@/lib/profit/types'
import { installCostFor, linesFor } from '@/lib/quotes/buildEstimate'
import type { QuoteSettings } from '@/lib/settings/schemas'
import { sizeSystem } from '@/lib/sizing/size'
import type { Plan, SystemSize } from '@/lib/sizing/types'

import { priceQuote } from './price'
import type { ComponentCategory, QuoteResult, TenureMonths } from './types'

export type PreviewFunder = {
  id: string
  name: string
  annualRate: number
  status: 'active' | 'paused'
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
  /** Go4Solar's side with each ACTIVE funder. */
  funders: { id: string; name: string; annualRate: number; profit: LoanProfit }[]
  /** System price as the deposit moves from 20% to 95%. */
  curve: { depositPct: number; systemPrice: number; monthly: number }[]
  quote: QuoteResult
}

/** Sample packages for the price preview (loads only; prices come from the draft). */
export const SAMPLE_PACKAGES: { id: string; label: string; totals: LoadTotals }[] = [
  { id: 'small-home', label: 'Small home · 480 W', totals: computeLoadTotals(sampleHomeItems) },
  {
    id: 'family-home',
    label: 'Family home · 2 kW',
    totals: {
      runningW: 2000,
      surgeW: 3200,
      dailyKwh: 18,
      byCategoryW: zeroByCategory(2000),
      heavyItems: [],
    },
  },
  {
    id: 'shop',
    label: 'Shop · 3.5 kW',
    totals: {
      runningW: 3500,
      surgeW: 6000,
      dailyKwh: 30,
      byCategoryW: zeroByCategory(3500),
      heavyItems: [],
    },
  },
]

function zeroByCategory(cooling: number): LoadTotals['byCategoryW'] {
  return {
    lighting: 0,
    tv_electronics: 0,
    kitchen: 0,
    cooling,
    laundry: 0,
    water_outdoor: 0,
    business: 0,
  }
}

function priceAt(input: PreviewInput, size: SystemSize, depositShare: number): QuoteResult {
  const { settings: s } = input
  return priceQuote({
    lines: linesFor(size, s.priceList),
    installCost: installCostFor(input.state, size.inverterKva, s.priceList),
    marginByCategory: s.pricing.marginByCategory,
    pricingRateAnnual: s.pricing.pricingRateByTenure[input.tenureMonths],
    tenureMonths: input.tenureMonths,
    depositShare,
    minDepositShare: s.minDepositShare,
  })
}

/**
 * The admin "Price preview": the same engines the customer sees (sizing → lines → priceQuote)
 * run on DRAFT settings, plus Go4Solar's side per active funder and a price-vs-deposit curve.
 * Pure: safe to run on every keystroke.
 */
export function buildPreview(input: PreviewInput): Preview {
  const size = sizeSystem(input.totals, input.plan, input.settings.sizing)
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

  const funders = input.funders
    .filter((f) => f.status === 'active')
    .map((f) => ({
      id: f.id,
      name: f.name,
      annualRate: f.annualRate,
      profit: loanProfit({
        systemPrice: quote.systemPrice,
        costPrice: quote.costPrice,
        deposit: quote.deposit,
        tenureMonths: input.tenureMonths,
        funderAnnualRate: f.annualRate,
        funderMethod: 'flat',
        unitCosts: input.unitCosts,
      }),
    }))

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
    curve,
    quote,
  }
}
