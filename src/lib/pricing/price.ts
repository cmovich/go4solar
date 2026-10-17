import { roundNaira, roundToStep } from '@/lib/money'

import type { QuoteInput, QuoteLine, QuoteResult } from './types'

/** Default lowest deposit (settings.min_deposit_share). */
export const DEFAULT_MIN_DEPOSIT_SHARE = 0.2
/** Highest deposit the slider allows. */
export const MAX_DEPOSIT_SHARE = 0.95
/** Equipment line prices are rounded to the nearest ₦100. */
export const LINE_ROUNDING_STEP = 100

export class DepositOutOfRangeError extends RangeError {
  constructor(
    public readonly depositShare: number,
    public readonly min: number,
    public readonly max: number,
  ) {
    super(`Deposit must be between ${min * 100}% and ${max * 100}% (got ${depositShare * 100}%)`)
    this.name = 'DepositOutOfRangeError'
  }
}

/**
 * Price a system (PRD "Pricing, markup and funders").
 *
 *   P = C / (1 − f × (1 − d))
 *
 * C = equipment at cost + base margins + installation; f = pricing rate for the tenure;
 * d = deposit share. The whole markup (P − installation − equipment cost) is spread over the
 * equipment lines at one rate m; installation is never marked up. No interest is shown to the
 * customer: they see one fixed price, a deposit and equal instalments.
 */
export function priceQuote(input: QuoteInput): QuoteResult {
  const minDepositShare = input.minDepositShare ?? DEFAULT_MIN_DEPOSIT_SHARE
  const { depositShare, tenureMonths, installCost } = input
  if (
    !Number.isFinite(depositShare) ||
    depositShare < minDepositShare ||
    depositShare > MAX_DEPOSIT_SHARE
  ) {
    throw new DepositOutOfRangeError(depositShare, minDepositShare, MAX_DEPOSIT_SHARE)
  }

  // E: equipment at cost. C: equipment with base margins, plus installation.
  const equipmentCost = input.lines.reduce((sum, l) => sum + l.unitCost * l.qty, 0)
  const costWithMargins = input.lines.reduce(
    (sum, l) => sum + l.unitCost * l.qty * (1 + input.marginByCategory[l.category]),
    0,
  )
  const C = costWithMargins + installCost
  const f = (input.pricingRateAnnual * tenureMonths) / 12
  // Near f(1 − d) = 1 the price runs away (and beyond it turns negative): refuse such a rate.
  if (f * (1 - depositShare) >= 1) {
    throw new RangeError(
      `The pricing rate ${Math.round(input.pricingRateAnnual * 100)}% a year is too high for ${tenureMonths} months`,
    )
  }
  const systemPrice = roundNaira(C / (1 - f * (1 - depositShare)))

  // One markup rate across all equipment lines.
  const equipmentPrice = systemPrice - installCost
  const markupShare = (equipmentPrice - equipmentCost) / equipmentCost

  const lineTotals = input.lines.map((l) =>
    roundToStep(l.unitCost * l.qty * (1 + markupShare), LINE_ROUNDING_STEP),
  )
  // Rounding remainder goes on the largest line (first if tied) so lines always add up.
  const remainder = equipmentPrice - lineTotals.reduce((a, b) => a + b, 0)
  if (remainder !== 0 && lineTotals.length > 0) {
    let largest = 0
    for (let i = 1; i < lineTotals.length; i++) {
      if ((lineTotals[i] ?? 0) > (lineTotals[largest] ?? 0)) largest = i
    }
    lineTotals[largest] = (lineTotals[largest] ?? 0) + remainder
  }

  const lines: QuoteLine[] = input.lines.map((l, i) => {
    const lineTotal = lineTotals[i] ?? 0
    return { ...l, lineTotal, unitPrice: roundNaira(lineTotal / l.qty) }
  })

  // Deposit and equal instalments; the last instalment absorbs rounding.
  const deposit = roundNaira(systemPrice * depositShare)
  const balance = systemPrice - deposit
  const monthly = roundNaira(balance / tenureMonths)
  const instalments = Array.from({ length: tenureMonths }, (_, i) =>
    i < tenureMonths - 1 ? monthly : balance - monthly * (tenureMonths - 1),
  )

  return {
    costPrice: equipmentCost + installCost,
    systemPrice,
    markupShare,
    lines,
    installCost,
    deposit,
    balance,
    instalments,
    monthly,
    snapshot: {
      version: 1,
      lines: input.lines.map((l) => ({ ...l })),
      installCost,
      marginByCategory: { ...input.marginByCategory },
      pricingRateAnnual: input.pricingRateAnnual,
      tenureMonths,
      depositShare,
      minDepositShare,
      roundingStep: LINE_ROUNDING_STEP,
    },
  }
}
