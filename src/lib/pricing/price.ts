import { roundNaira, roundToStep } from '@/lib/money'

import type { QuoteInput, QuoteLine, QuoteOffer, QuoteResult, TenureMonths } from './types'

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

  const noMarkup =
    input.noMarkup ??
    (installCost > 0 ? [{ label: 'Installation and logistics', amount: installCost }] : [])
  if (Math.abs(noMarkup.reduce((s, l) => s + l.amount, 0) - installCost) > 1) {
    throw new RangeError('The installation and delivery lines must add up to the installation cost')
  }

  if (input.offer) return priceOffer(input, input.offer, minDepositShare, noMarkup)

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

  const lines = spreadLines(
    input,
    input.lines.map((l) => l.unitCost * l.qty * (1 + markupShare)),
    equipmentPrice,
  )

  // Deposit and equal instalments; the last instalment absorbs rounding.
  const deposit = roundNaira(systemPrice * depositShare)
  const balance = systemPrice - deposit
  const { monthly, instalments } = splitMonthly(balance, tenureMonths)

  return {
    costPrice: equipmentCost + installCost,
    systemPrice,
    markupShare,
    lines,
    installCost,
    noMarkup: noMarkup.map((l) => ({ ...l })),
    deposit,
    balance,
    instalments,
    monthly,
    snapshot: {
      version: 1,
      lines: input.lines.map((l) => ({ ...l })),
      installCost,
      noMarkup: noMarkup.map((l) => ({ ...l })),
      marginByCategory: { ...input.marginByCategory },
      pricingRateAnnual: input.pricingRateAnnual,
      tenureMonths,
      depositShare,
      minDepositShare,
      roundingStep: LINE_ROUNDING_STEP,
    },
  }
}

/** Line totals rounded to ₦100; the rounding remainder goes on the largest line (first if tied). */
function spreadLines(input: QuoteInput, raw: number[], equipmentPrice: number): QuoteLine[] {
  const lineTotals = raw.map((v) => roundToStep(v, LINE_ROUNDING_STEP))
  const remainder = equipmentPrice - lineTotals.reduce((a, b) => a + b, 0)
  if (remainder !== 0 && lineTotals.length > 0) {
    let largest = 0
    for (let i = 1; i < lineTotals.length; i++) {
      if ((lineTotals[i] ?? 0) > (lineTotals[largest] ?? 0)) largest = i
    }
    lineTotals[largest] = (lineTotals[largest] ?? 0) + remainder
  }
  return input.lines.map((l, i) => {
    const lineTotal = lineTotals[i] ?? 0
    return { ...l, lineTotal, unitPrice: roundNaira(lineTotal / l.qty) }
  })
}

/** Equal monthly payments; the last one absorbs rounding. */
function splitMonthly(balance: number, months: number) {
  const monthly = roundNaira(balance / months)
  const instalments = Array.from({ length: months }, (_, i) =>
    i < months - 1 ? monthly : balance - monthly * (months - 1),
  )
  return { monthly, instalments }
}

/**
 * A partner offer (SPEWA for businesses and institutions, src/lib/spewa/offer.ts): SPEWA items at
 * their fixed selling price, other equipment at cost + base margin, installation at cost. The
 * charge for the length is added to the financed amount only:
 *   total payable = deposit + (cash price − deposit) × (1 + charge)
 * and is spread over the equipment lines (one fixed price; it is never shown as a charge).
 */
function priceOffer(
  input: QuoteInput,
  offer: QuoteOffer,
  minDepositShare: number,
  noMarkup: { label: string; amount: number }[],
): QuoteResult {
  const { depositShare, tenureMonths, installCost } = input
  const charge = offer.chargeByTenure[tenureMonths as TenureMonths]
  if (charge === undefined) {
    throw new RangeError(`${tenureMonths} months is not offered for this offer`)
  }
  const cashOf = (l: QuoteInput['lines'][number]) =>
    l.sellUnit !== undefined
      ? l.sellUnit * l.qty
      : l.unitCost * l.qty * (1 + input.marginByCategory[l.category])
  const equipmentCash = roundNaira(input.lines.reduce((s, l) => s + cashOf(l), 0))
  const cash = equipmentCash + installCost
  const deposit = roundNaira(cash * depositShare)
  const financed = cash - deposit
  const balance = roundNaira(financed * (1 + charge))
  const systemPrice = deposit + balance
  const equipmentPrice = systemPrice - installCost
  const equipmentCost = input.lines.reduce((s, l) => s + l.unitCost * l.qty, 0)
  const factor = equipmentCash > 0 ? equipmentPrice / equipmentCash : 1
  const lines = spreadLines(
    input,
    input.lines.map((l) => cashOf(l) * factor),
    equipmentPrice,
  )
  const { monthly, instalments } = splitMonthly(balance, tenureMonths)
  return {
    costPrice: equipmentCost + installCost,
    systemPrice,
    markupShare: equipmentCost > 0 ? (equipmentPrice - equipmentCost) / equipmentCost : 0,
    lines,
    installCost,
    noMarkup: noMarkup.map((l) => ({ ...l })),
    deposit,
    balance,
    instalments,
    monthly,
    snapshot: {
      version: 1,
      lines: input.lines.map((l) => ({ ...l })),
      installCost,
      noMarkup: noMarkup.map((l) => ({ ...l })),
      marginByCategory: { ...input.marginByCategory },
      pricingRateAnnual: input.pricingRateAnnual,
      tenureMonths,
      depositShare,
      minDepositShare,
      roundingStep: LINE_ROUNDING_STEP,
      offer: { ...offer, chargeByTenure: { ...offer.chargeByTenure } },
    },
  }
}
