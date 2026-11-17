import { z } from 'zod'

import type { OfferTerms } from './offer'
import { PRICE_COLUMNS, SPEWA_CATEGORIES, SPEWA_KINDS } from './priceList'

/** Admin → Pricing → SPEWA price list: one item (prices in naira, empty = no price). */
const price = z.number().nonnegative('Prices cannot be negative.').max(1e11).nullable()
const size = z.number().positive().max(100_000).nullable()

export const spewaItemSchema = z
  .object({
    id: z.string().uuid().optional(),
    itemNo: z.number().int().positive().max(100_000).nullable(),
    category: z.enum(SPEWA_CATEGORIES),
    code: z
      .string()
      .trim()
      .min(1, 'Enter the item code.')
      .max(40)
      .transform((c) => c.toUpperCase()),
    product: z.string().trim().min(1, 'Enter the product name.').max(200),
    brand: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .transform((b) => b || null),
    warranty: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .transform((w) => w || null),
    prices: z.object(Object.fromEntries(PRICE_COLUMNS.map((c) => [c, price])) as Record<
      (typeof PRICE_COLUMNS)[number],
      typeof price
    >),
    kind: z.enum(SPEWA_KINDS),
    ratingKw: size,
    voltage: size,
    highVoltage: z.boolean(),
    kwh: size,
    watts: size,
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
  })
  .superRefine((v, ctx) => {
    if (!v.active) return
    const need = (ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', message, path: ['size'] })
    }
    if (v.kind === 'inverter') need(v.ratingKw !== null, 'Enter the inverter size (kW).')
    if (v.kind === 'battery') need(v.kwh !== null, 'Enter the battery size (kWh).')
    if (v.kind === 'panel') need(v.watts !== null, 'Enter the panel watts.')
  })
export type SpewaItemInput = z.output<typeof spewaItemSchema>

export function itemToRow(i: SpewaItemInput) {
  return {
    item_no: i.itemNo,
    category: i.category,
    code: i.code,
    product: i.product,
    brand: i.brand,
    warranty: i.warranty,
    ...i.prices,
    kind: i.kind,
    rating_kw: i.ratingKw,
    voltage: i.voltage,
    high_voltage: i.highVoltage,
    kwh: i.kwh,
    watts: i.watts,
    active: i.active,
    sort_order: i.sortOrder,
  }
}

const pct = (max: number) => z.number({ error: 'Enter a percentage.' }).min(0).max(max)
const toShare = (p: number) => Math.round(p * 10_000) / 1_000_000

/** The offer terms as the admin form shows them (percentages). */
export const offerTermsForm = z
  .object({
    partnerColumn: z.enum(PRICE_COLUMNS),
    sellingColumn: z.enum(PRICE_COLUMNS),
    priceListDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as YYYY-MM-DD.'),
    validityDays: z.number().int().min(1, 'At least 1 day.').max(90, 'At most 90 days.'),
    charges: z.object({ 3: pct(100), 6: pct(100), 9: pct(100), 12: pct(100) }),
    badDebtPct: pct(50),
    go4solarPct: pct(100),
  })
  .refine((v) => v.partnerColumn !== v.sellingColumn, {
    message: 'The partner price and the selling price must be different columns.',
    path: ['sellingColumn'],
  })
  .transform(
    (v): OfferTerms => ({
      partnerColumn: v.partnerColumn,
      sellingColumn: v.sellingColumn,
      priceListDate: v.priceListDate,
      validityDays: v.validityDays,
      chargeByTenure: {
        3: toShare(v.charges[3]),
        6: toShare(v.charges[6]),
        9: toShare(v.charges[9]),
        12: toShare(v.charges[12]),
      },
      badDebtShare: toShare(v.badDebtPct),
      go4solarShare: toShare(v.go4solarPct),
    }),
  )
export type OfferTermsFormInput = z.input<typeof offerTermsForm>

const toPct = (s: number | undefined) => Math.round((s ?? 0) * 1_000_000) / 10_000

export function termsToForm(t: OfferTerms): OfferTermsFormInput {
  return {
    partnerColumn: t.partnerColumn,
    sellingColumn: t.sellingColumn,
    priceListDate: t.priceListDate,
    validityDays: t.validityDays,
    charges: {
      3: toPct(t.chargeByTenure[3]),
      6: toPct(t.chargeByTenure[6]),
      9: toPct(t.chargeByTenure[9]),
      12: toPct(t.chargeByTenure[12]),
    },
    badDebtPct: toPct(t.badDebtShare),
    go4solarPct: toPct(t.go4solarShare),
  }
}
