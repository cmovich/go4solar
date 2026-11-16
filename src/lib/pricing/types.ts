/** Every tenure the system knows. Which ones customers may choose is set in /admin/pricing. */
export const TENURES = [3, 6, 9, 12, 18, 24] as const
export type TenureMonths = (typeof TENURES)[number]

/** Yearly pricing rate per tenure; only tenures that are switched on have a rate. */
export type RateByTenure = Partial<Record<TenureMonths, number>>

export type ComponentCategory = 'panels' | 'battery' | 'inverter' | 'accessories'

export type QuoteLineInput = {
  sku: string
  name: string
  category: ComponentCategory
  /** Landed cost of one unit, naira (SPEWA offer: the partner price). */
  unitCost: number
  qty: number
  /**
   * SPEWA offer only: the fixed selling price of one unit (the price list's selling column),
   * before the financing charge. Lines without it are priced at cost + base margin.
   */
  sellUnit?: number
}

/** The terms of a partner offer (SPEWA for businesses and institutions), kept with each quote. */
export type QuoteOffer = {
  kind: 'spewa'
  /** Charge on the financed amount per length (0.075 = 7.5% for 3 months). */
  chargeByTenure: Partial<Record<TenureMonths, number>>
  /** Bad-debt provision on the financed amount (staff profit view only). */
  badDebtShare: number
  /** Go4Solar's share of the profit; the rest is SPEWA's. */
  go4solarShare: number
  partnerColumn: string
  sellingColumn: string
  priceListDate: string
  validityDays: number
}

/** A cost that is never marked up (installation, delivery), as its own invoice line. */
export type NoMarkupLine = { label: string; amount: number }

export type QuoteInput = {
  lines: QuoteLineInput[]
  /** Installation and logistics; never marked up. */
  installCost: number
  /** installCost broken into invoice lines (must add up to it). */
  noMarkup?: NoMarkupLine[]
  /** Base margin per category as a decimal (0.125 = 12.5%). */
  marginByCategory: Record<ComponentCategory, number>
  /** Pricing rate per year as a decimal (funder cost + spread + buffer, e.g. 0.24). */
  pricingRateAnnual: number
  tenureMonths: TenureMonths
  /** Deposit as a share of the system price (0.2 = 20%). */
  depositShare: number
  /** Lowest deposit allowed (settings.min_deposit_share). Defaults to 0.2. */
  minDepositShare?: number
  /** A partner offer: fixed selling prices + a charge on the financed amount (see priceQuote). */
  offer?: QuoteOffer
}

export type QuoteLine = QuoteLineInput & {
  /** Selling price of one unit after markup (lineTotal ÷ qty, whole naira). */
  unitPrice: number
  /** Selling price of the line, rounded to ₦100 (plus any rounding remainder on the largest line). */
  lineTotal: number
}

export type QuoteResult = {
  /** Landed equipment + installation (what Go4Solar pays). */
  costPrice: number
  /** What the customer pays in total. */
  systemPrice: number
  /** One markup share applied to every equipment line. */
  markupShare: number
  lines: QuoteLine[]
  installCost: number
  /** installCost as invoice lines (installation, delivery…). */
  noMarkup: NoMarkupLine[]
  deposit: number
  balance: number
  /** One amount per month; the last one absorbs rounding so they sum to the balance. */
  instalments: number[]
  monthly: number
  /** Everything used to price this quote, so later setting changes never alter it. */
  snapshot: QuoteSnapshot
}

export type QuoteSnapshot = {
  version: 1
  lines: QuoteLineInput[]
  installCost: number
  /** Missing on quotes priced before Part F. */
  noMarkup?: NoMarkupLine[]
  marginByCategory: Record<ComponentCategory, number>
  pricingRateAnnual: number
  tenureMonths: TenureMonths
  depositShare: number
  minDepositShare: number
  roundingStep: number
  /** Present on SPEWA offer quotes. */
  offer?: QuoteOffer
}
