import { formatNaira } from '@/lib/money'
import type { NgStateId } from '@/lib/nigeria/states'
import { DEFAULT_FLAT_TERMS, flatRates } from '@/lib/pricing/flat'
import { priceQuote } from '@/lib/pricing/price'
import type { QuoteLineInput, QuoteResult } from '@/lib/pricing/types'
import type { QuoteSettings } from '@/lib/settings/schemas'
import type { Plan, SystemSize } from '@/lib/sizing/types'
import type { SiteAnswers } from '@/lib/wizard/questions'

import { catalogueExtras, installCostFor, type Estimate, type PlanEstimate } from './buildEstimate'

/**
 * One-time update of old waiting-list quotes to the 4% ready-made terms (Semako, 27 Nov 2026,
 * method c): each person keeps exactly the items and quantities they were quoted; the prices are
 * today's (by item code), installation and delivery today's for their state, and the terms the
 * new ones. Their system (size) never changes. Pure: the caller saves the old version first.
 */
export type TermsUpdateInput = {
  settings: QuoteSettings
  /** Today's cost per item code (upper case). An item not in it keeps its old cost. */
  costBySku: Map<string, number>
  state: NgStateId
  site?: SiteAnswers
  /** Swap the accessories pack for today's right-size pack for the inverter. */
  rightSizePack?: boolean
}

export const TERMS_UPDATE_REASON = 'Replaced by updated quote (4% terms)'

/** Today's accessories pack for this inverter size (the smallest tier that covers it), as quotes name it. */
function packFor(kva: number, s: QuoteSettings): { sku: string; unitCost: number } {
  const tiers = [...s.priceList.accessoriesByKva].sort((a, b) => a.maxKva - b.maxKva)
  const t = tiers.find((x) => kva <= x.maxKva) ?? tiers[tiers.length - 1]!
  return { sku: `ACC-${t.maxKva}`, unitCost: t.unitCost }
}

function repricePlan(
  p: PlanEstimate,
  depositShare: number,
  input: TermsUpdateInput,
  missing: Set<string>,
): QuoteResult {
  const s = input.settings
  const terms = s.homeTerms ?? DEFAULT_FLAT_TERMS
  let base: QuoteLineInput[] = p.quote.snapshot.lines
    // The rack is worked out again from today's rack prices.
    .filter((l) => !l.sku.startsWith('RACK-'))
    .map((l) => {
      const c = input.costBySku.get(l.sku.toUpperCase())
      if (c === undefined) missing.add(l.sku)
      return { ...l, unitCost: c ?? l.unitCost }
    })
  if (input.rightSizePack) {
    const pack = packFor(p.size.inverterKva, s)
    base = base.map((l) =>
      l.category === 'accessories' && /^ACC-[0-9.]+$/i.test(l.sku)
        ? { ...l, sku: pack.sku, unitCost: pack.unitCost }
        : l,
    )
  }
  const ex = catalogueExtras(p.size, input.state, input.site ?? {}, s, base)
  return priceQuote({
    lines: ex.lines,
    installCost: ex.noMarkup
      ? ex.noMarkup.reduce((t, n) => t + n.amount, 0)
      : installCostFor(input.state, p.size.inverterKva, s.priceList),
    noMarkup: ex.noMarkup,
    marginByCategory: s.pricing.marginByCategory,
    pricingRateAnnual: terms.monthlyRate * 12,
    tenureMonths: 12,
    depositShare,
    minDepositShare: s.minDepositShare,
    terms,
  })
}

type Chosen = PlanEstimate & { plan: Plan; depositShare: number }

export function updateEstimateTerms(
  old: Estimate,
  input: TermsUpdateInput,
): { estimate: Estimate; missing: string[] } {
  const missing = new Set<string>()
  const terms = input.settings.homeTerms ?? DEFAULT_FLAT_TERMS
  const plans = Object.fromEntries(
    Object.entries(old.plans).map(([k, p]) => [
      k,
      { ...p, quote: repricePlan(p, old.depositShare, input, missing) },
    ]),
  ) as Estimate['plans']
  const was = (old as Estimate & { chosen?: Chosen }).chosen
  const chosen = was
    ? { ...was, quote: repricePlan(was, was.depositShare, input, missing) }
    : undefined
  const estimate = {
    ...old,
    tenureMonths: 12,
    sample: input.settings.priceList.sample || input.settings.pricing.sample,
    pricingRateByTenure: flatRates(terms),
    plans,
    pricedAt: new Date().toISOString(),
    ...(chosen ? { chosen } : {}),
  } as Estimate
  return { estimate, missing: [...missing] }
}

export const SIZING_TOO_LARGE_NOTE =
  'Check appliance list on the call — load looks too big for one system.'

type Size = Pick<SystemSize, 'inverterKva' | 'batteryKwh' | 'panelCount'>
const sizeText = (z: Size) =>
  `${z.inverterKva} kVA · ${z.batteryKwh} kWh · ${z.panelCount} panel${z.panelCount === 1 ? '' : 's'}`

/** Clearly different: another inverter size, or the battery or panels more than about 25% off. */
export function clearlyDifferent(a: Size, b: Size): boolean {
  return (
    a.inverterKva !== b.inverterKva ||
    Math.abs(b.batteryKwh - a.batteryKwh) > 0.25 * Math.max(a.batteryKwh, 1) ||
    Math.abs(b.panelCount - a.panelCount) > Math.max(1, 0.25 * a.panelCount)
  )
}

/** The staff note when today's sizing (from the appliance list) differs clearly. */
export function sizingNote(
  quoted: Size,
  today: { size: Size; total: number } | 'too-large',
): string | null {
  if (today === 'too-large') return SIZING_TOO_LARGE_NOTE
  if (!clearlyDifferent(quoted, today.size)) return null
  return `Today's sizing suggests ${sizeText(today.size)} at about ${formatNaira(today.total)} — mention this on the call.`
}
