import { z } from 'zod'

import { roundNaira } from '@/lib/money'
import type {
  QuoteLineInput,
  QuoteOffer,
  QuoteResult,
  RateByTenure,
  TenureMonths,
} from '@/lib/pricing/types'
import type { PriceList } from '@/lib/settings/schemas'

import { PRICE_COLUMNS, priceOf, type PriceColumn, type SpewaItem } from './priceList'

/**
 * The SPEWA offer for businesses and institutions (pure).
 *
 *   cash price = SPEWA equipment at the SELLING price + our accessories (cost + margin)
 *                + installation and delivery (never marked up)
 *   deposit    = cash price × deposit share (30% minimum)
 *   financed   = cash price − deposit
 *   total      = deposit + financed × (1 + charge for the length)   (7.5 / 15 / 22.5 / 30%)
 *   pay in full = the cash price (no charge)
 *
 * Profit (staff only) = selling − PARTNER price (SPEWA's equipment cost) + the charge
 *   + accessories margin − bad-debt provision on the financed amount, shared 50/50.
 */

export type OfferTerms = {
  partnerColumn: PriceColumn
  sellingColumn: PriceColumn
  /** Date of SPEWA's price list (YYYY-MM-DD). */
  priceListDate: string
  validityDays: number
  chargeByTenure: Partial<Record<TenureMonths, number>>
  badDebtShare: number
  go4solarShare: number
}

export const DEFAULT_OFFER_TERMS: OfferTerms = {
  partnerColumn: 'big_dealer',
  sellingColumn: 'installer',
  priceListDate: '2026-11-09',
  validityDays: 7,
  chargeByTenure: { 3: 0.075, 6: 0.15, 9: 0.225, 12: 0.3 },
  badDebtShare: 0.02,
  go4solarShare: 0.5,
}

export const OFFER_TENURES = [3, 6, 9, 12] as const satisfies readonly TenureMonths[]

const column = z.enum(PRICE_COLUMNS)
const share = z.number().min(0).max(1)
export const offerTermsSchema = z.object({
  partnerColumn: column,
  sellingColumn: column,
  priceListDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validityDays: z.number().int().min(1).max(90),
  chargeByTenure: z.object({
    3: share.optional(),
    6: share.optional(),
    9: share.optional(),
    12: share.optional(),
  }),
  badDebtShare: share,
  go4solarShare: share,
})

/** settings.spewa_offer, field by field; a field that is missing or wrong takes the default. */
export function offerTermsFrom(value: unknown): OfferTerms {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const shape = offerTermsSchema.shape
  const field = <K extends keyof OfferTerms>(k: K): OfferTerms[K] => {
    const r = (shape[k] as unknown as z.ZodType<OfferTerms[K]>).safeParse(v[k])
    return r.success ? r.data : DEFAULT_OFFER_TERMS[k]
  }
  const charges = field('chargeByTenure')
  return {
    partnerColumn: field('partnerColumn'),
    sellingColumn: field('sellingColumn'),
    priceListDate: field('priceListDate'),
    validityDays: field('validityDays'),
    chargeByTenure: Object.keys(charges).length > 0 ? charges : DEFAULT_OFFER_TERMS.chargeByTenure,
    badDebtShare: field('badDebtShare'),
    go4solarShare: field('go4solarShare'),
  }
}

/** The terms a quote keeps: the charges for the lengths the routing rule allows. */
export function quoteOffer(terms: OfferTerms, tenures: readonly TenureMonths[]): QuoteOffer {
  const chargeByTenure: Partial<Record<TenureMonths, number>> = {}
  for (const t of tenures) {
    const c = terms.chargeByTenure[t]
    if (c !== undefined) chargeByTenure[t] = c
  }
  return {
    kind: 'spewa',
    chargeByTenure,
    badDebtShare: terms.badDebtShare,
    go4solarShare: terms.go4solarShare,
    partnerColumn: terms.partnerColumn,
    sellingColumn: terms.sellingColumn,
    priceListDate: terms.priceListDate,
    validityDays: terms.validityDays,
  }
}

export function chargeFor(offer: QuoteOffer, months: TenureMonths): number {
  const c = offer.chargeByTenure[months]
  if (c === undefined) throw new RangeError(`${months} months is not offered for this offer`)
  return c
}

/** What is paid monthly in all: financed × (1 + charge), to the naira. */
export function financedTotal(financed: number, offer: QuoteOffer, months: TenureMonths): number {
  return roundNaira(financed * (1 + chargeFor(offer, months)))
}

/**
 * The charges as yearly figures, keyed by length, so code that lists an estimate's lengths
 * (pricingRateByTenure) offers exactly these. The price engine reads the charge itself.
 */
export function annualisedRates(offer: QuoteOffer): RateByTenure {
  const out: RateByTenure = {}
  for (const [k, c] of Object.entries(offer.chargeByTenure)) {
    const n = Number(k) as TenureMonths
    if (c !== undefined) out[n] = Math.round(((c * 12) / n) * 1e6) / 1e6
  }
  return out
}

/** High-voltage inverters and batteries are paired on this nominal bus voltage for sizing. */
export const HV_BATTERY_V = 400

type Costed = { sku: string; name: string; unitCost: number; brand: string | null }
export type OfferEquipment = {
  inverters: (Costed & { kva: number; nominalVoltage: number | null })[]
  batteries: (Costed & { kwh: number; nominalVoltage: number | null })[]
  panels: (Costed & { watts: number })[]
  lights: (Costed & { watts: number | null })[]
  /** Selling price of one unit, by code. Only items with both prices are in it. */
  sell: Record<string, number>
}

/** SPEWA items that can be quoted: switched on, with a partner and a selling price, sized. */
export function offerEquipment(items: SpewaItem[], terms: OfferTerms): OfferEquipment {
  const out: OfferEquipment = { inverters: [], batteries: [], panels: [], lights: [], sell: {} }
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const i of sorted) {
    const partner = priceOf(i, terms.partnerColumn)
    const selling = priceOf(i, terms.sellingColumn)
    if (!i.active || partner === null || selling === null) continue
    const base = { sku: i.code, name: i.product, unitCost: partner, brand: i.brand }
    const volts = i.highVoltage ? HV_BATTERY_V : i.voltage
    if (i.kind === 'inverter' && i.ratingKw) {
      out.inverters.push({ ...base, kva: i.ratingKw, nominalVoltage: volts })
    } else if (i.kind === 'battery' && i.kwh) {
      out.batteries.push({ ...base, kwh: i.kwh, nominalVoltage: volts })
    } else if (i.kind === 'panel' && i.watts) {
      out.panels.push({ ...base, watts: i.watts })
    } else if (i.kind === 'light') {
      out.lights.push({ ...base, watts: i.watts })
    } else continue
    out.sell[i.code] = selling
  }
  return out
}

/**
 * Our price list with SPEWA's inverters, batteries and panel (partner price as the cost) for the
 * sizing engine; our accessories and installation stay. Panel: the cheapest per watt (selling).
 * Null when SPEWA has no quotable inverter, battery or panel.
 */
export function offerPriceList(base: PriceList, eq: OfferEquipment): PriceList | null {
  if (eq.inverters.length === 0 || eq.batteries.length === 0 || eq.panels.length === 0) {
    return null
  }
  const perWatt = (p: OfferEquipment['panels'][number]) => (eq.sell[p.sku] ?? 0) / p.watts
  const panel = [...eq.panels].sort((a, b) => perWatt(a) - perWatt(b))[0]!
  const perKwh = (b: OfferEquipment['batteries'][number]) => (eq.sell[b.sku] ?? 0) / b.kwh
  const batteryModule =
    [...eq.batteries].filter((b) => b.nominalVoltage === 48).sort((a, b) => perKwh(a) - perKwh(b))[0] ??
    [...eq.batteries].sort((a, b) => perKwh(a) - perKwh(b))[0]!
  return {
    ...base,
    skipped: undefined,
    panel: { sku: panel.sku, name: panel.name, unitCost: panel.unitCost, watts: panel.watts },
    batteryModule: {
      sku: batteryModule.sku,
      name: batteryModule.name,
      unitCost: batteryModule.unitCost,
      kwh: batteryModule.kwh,
    },
    batteries: eq.batteries.map((b) => ({
      sku: b.sku,
      name: b.name,
      unitCost: b.unitCost,
      kwh: b.kwh,
      nominalVoltage: b.nominalVoltage,
    })),
    inverters: [...eq.inverters]
      .sort((a, b) => a.kva - b.kva)
      .map((i) => ({
        sku: i.sku,
        name: i.name,
        unitCost: i.unitCost,
        kva: i.kva,
        nominalVoltage: i.nominalVoltage,
      })),
  }
}

/** Attach SPEWA selling prices to the lines that are SPEWA items. */
export function withSellPrices(
  lines: QuoteLineInput[],
  sell: Record<string, number>,
): QuoteLineInput[] {
  return lines.map((l) => (sell[l.sku] !== undefined ? { ...l, sellUnit: sell[l.sku] } : l))
}

export type OfferProfit = {
  partnerPrice: number
  sellingPrice: number
  equipmentMargin: number
  accessoriesPrice: number
  accessoriesMargin: number
  /** Installation and delivery, passed through at cost. */
  installation: number
  cashPrice: number
  deposit: number
  financed: number
  financingCharge: number
  badDebt: number
  profit: number
  go4solar: number
  spewa: number
}

/** The staff profit view of a SPEWA offer quote (null for any other quote). */
export function offerProfit(q: QuoteResult): OfferProfit | null {
  const snap = q.snapshot
  const offer = snap.offer
  if (!offer) return null
  let partnerPrice = 0
  let sellingPrice = 0
  let accessoriesCost = 0
  let accessoriesPrice = 0
  for (const l of snap.lines) {
    if (l.sellUnit !== undefined) {
      partnerPrice += l.unitCost * l.qty
      sellingPrice += l.sellUnit * l.qty
    } else {
      accessoriesCost += l.unitCost * l.qty
      accessoriesPrice += l.unitCost * l.qty * (1 + snap.marginByCategory[l.category])
    }
  }
  accessoriesPrice = roundNaira(accessoriesPrice)
  const cash = roundNaira(sellingPrice + accessoriesPrice + snap.installCost)
  // Paid in full (no monthly payments): nothing financed, no charge.
  const financed = q.instalments.length === 0 ? 0 : cash - q.deposit
  const financingCharge = q.instalments.length === 0 ? 0 : q.systemPrice - cash
  const badDebt = roundNaira(financed * offer.badDebtShare)
  const equipmentMargin = roundNaira(sellingPrice - partnerPrice)
  const accessoriesMargin = roundNaira(accessoriesPrice - accessoriesCost)
  const profit = equipmentMargin + financingCharge + accessoriesMargin - badDebt
  const go4solar = roundNaira(profit * offer.go4solarShare)
  return {
    partnerPrice: roundNaira(partnerPrice),
    sellingPrice: roundNaira(sellingPrice),
    equipmentMargin,
    accessoriesPrice,
    accessoriesMargin,
    installation: snap.installCost,
    cashPrice: cash,
    deposit: q.instalments.length === 0 ? q.systemPrice : q.deposit,
    financed,
    financingCharge,
    badDebt,
    profit,
    go4solar,
    spewa: profit - go4solar,
  }
}

/** Everything a business quote needs (QuoteSettings.businessOffer). */
export type BusinessOffer = {
  offer: QuoteOffer
  funderId: string
  minDepositShare: number
  tenures: TenureMonths[]
  /** Our price list with SPEWA's inverters, batteries and panel (for sizing and lines). */
  priceList: PriceList
  sell: Record<string, number>
  equipment: OfferEquipment
}

/** The minimum deposit message (slider and server). */
export const offerMinDepositText = (minDepositShare: number) =>
  `The minimum deposit for this offer is ${Math.round(minDepositShare * 100)}%`

/**
 * The business offer from SPEWA's price list, the terms and the routing rule. Null (businesses
 * are priced like everyone else) when the rule has no 12-month length (estimates are priced at
 * 12) or SPEWA has no quotable inverter, battery and panel.
 */
export function businessOfferFrom(input: {
  items: SpewaItem[]
  terms: OfferTerms
  rule: { funderId: string; minDepositShare: number; tenures: TenureMonths[] } | null
  base: PriceList
}): BusinessOffer | null {
  const { rule, terms } = input
  if (!rule || !rule.tenures.includes(12)) return null
  const tenures = rule.tenures.filter((t) => terms.chargeByTenure[t] !== undefined)
  if (!tenures.includes(12)) return null
  const equipment = offerEquipment(input.items, terms)
  const priceList = offerPriceList(input.base, equipment)
  if (!priceList) return null
  return {
    offer: quoteOffer(terms, tenures),
    funderId: rule.funderId,
    minDepositShare: rule.minDepositShare,
    tenures,
    priceList,
    sell: equipment.sell,
    equipment,
  }
}
