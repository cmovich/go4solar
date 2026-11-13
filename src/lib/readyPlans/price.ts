import type {
  ComponentCategory,
  NoMarkupLine,
  QuoteLine,
  QuoteResult,
  TenureMonths,
} from '@/lib/pricing/types'
import type { SystemSize } from '@/lib/sizing/types'

import type { LineKind, ReadyLine, ReadyPlan } from './types'

/**
 * Ready-made plan pricing (pure). For these plans only; custom and app quotes keep the engine.
 *   price     = sum of the Go4Solar line prices (installation and included delivery are lines)
 *   deposit   = price × deposit share; financed = price − deposit
 *   n months  → total = financed × (1 + rate × n); monthly = total ÷ n to the naira, the last
 *               payment adjusts; total payable = deposit + total
 *   full pay  = the 12-month total payable × (1 − discount)
 *   delivery outside the included state: paid upfront (with the deposit or the full payment),
 *   not financed and never discounted.
 */

const naira = (n: number) => Math.round(n)
const sum = (lines: ReadyLine[], key: 'price' | 'vendorCost') =>
  lines.reduce((t, l) => t + l[key], 0)

export const planPrice = (p: ReadyPlan) => sum(p.lines, 'price')
export const vendorTotal = (p: ReadyPlan) => sum(p.lines, 'vendorCost')
/** The delivery included in the price (logistics lines). */
export const includedDelivery = (p: ReadyPlan) =>
  sum(
    p.lines.filter((l) => l.kind === 'logistics'),
    'price',
  )

/**
 * Extra delivery outside the plan's included state: that state's delivery price (Admin → Pricing →
 * Builder delivery table, or its "Other" row) minus the included delivery, never below 0.
 */
export function deliveryExtra(p: ReadyPlan, state: string, statePrice: number | null): number {
  if (state === p.deliveryState || statePrice === null) return 0
  return Math.max(0, naira(statePrice - includedDelivery(p)))
}

export type ReadyPriced = {
  planPrice: number
  deposit: number
  financed: number
  /** What is paid monthly over the months, in all. */
  total: number
  instalments: number[]
  monthly: number
  months: number
  extra: number
  /** Paid before installation: the deposit and any extra delivery. */
  upfront: number
  /** Deposit + total + extra delivery. */
  totalPayable: number
  /** Pay in full instead: the 12-month total payable less the discount, plus extra delivery. */
  fullPayment: number
}

function financedTotal(p: ReadyPlan, financed: number, months: number) {
  return naira(financed * (1 + p.monthlyRate * months))
}

export function priceReadyPlan(p: ReadyPlan, months: number, extra = 0): ReadyPriced {
  if (!p.tenures.includes(months)) {
    throw new Error(`${months} months is not offered for ${p.name}`)
  }
  const price = planPrice(p)
  const deposit = naira(price * p.depositShare)
  const financed = price - deposit
  const total = financedTotal(p, financed, months)
  const monthly = naira(total / months)
  const instalments = Array.from({ length: months }, (_, i) =>
    i === months - 1 ? total - monthly * (months - 1) : monthly,
  )
  const twelveMonthPayable = deposit + financedTotal(p, financed, 12)
  return {
    planPrice: price,
    deposit,
    financed,
    total,
    instalments,
    monthly,
    months,
    extra,
    upfront: deposit + extra,
    totalPayable: deposit + total + extra,
    fullPayment: naira(twelveMonthPayable * (1 - p.fullDiscount)) + extra,
  }
}

const CATEGORY: Partial<Record<LineKind, ComponentCategory>> = {
  battery: 'battery',
  inverter: 'inverter',
  panels: 'panels',
}
const NO_MARKUP: LineKind[] = ['installation', 'logistics']

/** The extra delivery as its own line. */
export const deliveryExtraLabel = (state: string) => `Delivery to ${state} (extra)`

/**
 * The plan as the QuoteResult every later step reads (application, agreement, deposit, loan,
 * profit): cost price = vendor costs (+ the extra delivery, passed through at cost), system
 * price = total payable, deposit = everything paid upfront, instalments as priced.
 */
export function readyQuoteResult(p: ReadyPlan, priced: ReadyPriced, state: string): QuoteResult {
  const equipment = p.lines.filter((l) => !NO_MARKUP.includes(l.kind))
  const lines: QuoteLine[] = equipment.map((l, i) => ({
    sku: l.sku || `RP-${p.slug}-${i + 1}`.toUpperCase(),
    name: [l.name, l.spec].filter(Boolean).join(' '),
    category: CATEGORY[l.kind] ?? 'accessories',
    unitCost: naira(l.vendorCost / l.qty),
    qty: l.qty,
    unitPrice: naira(l.price / l.qty),
    lineTotal: l.price,
  }))
  const noMarkup: NoMarkupLine[] = [
    ...p.lines
      .filter((l) => NO_MARKUP.includes(l.kind))
      .map((l) => ({ label: l.name, amount: l.price })),
    ...(priced.extra > 0 ? [{ label: deliveryExtraLabel(state), amount: priced.extra }] : []),
  ]
  const installCost = noMarkup.reduce((t, l) => t + l.amount, 0)
  const cost = vendorTotal(p) + priced.extra
  const equipmentCost = equipment.reduce((t, l) => t + l.vendorCost, 0)
  const equipmentPrice = equipment.reduce((t, l) => t + l.price, 0)
  return {
    costPrice: cost,
    systemPrice: priced.totalPayable,
    markupShare: equipmentCost > 0 ? equipmentPrice / equipmentCost - 1 : 0,
    lines,
    installCost,
    noMarkup,
    deposit: priced.upfront,
    balance: priced.total,
    instalments: priced.instalments,
    monthly: priced.monthly,
    snapshot: {
      version: 1,
      lines: lines.map(({ sku, name, category, unitCost, qty }) => ({
        sku,
        name,
        category,
        unitCost,
        qty,
      })),
      installCost,
      noMarkup,
      marginByCategory: { panels: 0, battery: 0, inverter: 0, accessories: 0 },
      // The flat monthly rate as a yearly figure (admin only).
      pricingRateAnnual: p.monthlyRate * 12,
      tenureMonths: priced.months as TenureMonths,
      depositShare: p.depositShare,
      minDepositShare: p.depositShare,
      roundingStep: 1,
    },
  }
}

/**
 * Pay in full: the same plan as one payment of its pay-in-full price (the 12-month total payable
 * less the discount, plus any extra delivery). Nothing is financed: no balance, no monthly
 * payments. Cost price = vendor costs (+ the extra delivery), as for a monthly plan.
 */
export function fullPaymentQuoteResult(
  p: ReadyPlan,
  priced: ReadyPriced,
  state: string,
): QuoteResult {
  const base = readyQuoteResult(p, priced, state)
  return {
    ...base,
    systemPrice: priced.fullPayment,
    deposit: priced.fullPayment,
    balance: 0,
    instalments: [],
    monthly: 0,
    // Deposit share stays the plan's: records allow 20–95%, and "pay in full" is marked on the
    // stored plan (fixed.payment), not by a 100% deposit.
    snapshot: { ...base.snapshot, tenureMonths: 12 },
  }
}

/** What may reach a browser: no vendor costs, no per-line prices, no rate, no admin note. */
export type PublicReadyPlan = {
  slug: string
  name: string
  tagline: string | null
  summary: string
  tag: string | null
  systemVoltage: number
  inverterKva: number
  image: string | null
  lines: { name: string; spec: string; qty: number }[]
  canPower: string[]
  backup: string[]
  tenures: number[]
  fullDiscount: number
  deliveryState: string
  sample: boolean
}

export function publicPlan(p: ReadyPlan): PublicReadyPlan {
  return {
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    summary: p.summary,
    tag: p.tag,
    systemVoltage: p.systemVoltage,
    inverterKva: p.inverterKva,
    image: p.image,
    lines: p.lines.map((l) => ({ name: l.name, spec: l.spec, qty: l.qty })),
    canPower: p.canPower,
    backup: p.backup,
    tenures: [...p.tenures].sort((a, b) => a - b),
    fullDiscount: p.fullDiscount,
    deliveryState: p.deliveryState,
    sample: p.sample,
  }
}

const firstNumber = (text: string, unit: string) => {
  const m = new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*${unit}\\b`, 'i').exec(text)
  return m ? Number(m[1]) : 0
}
const r2 = (n: number) => Math.round(n * 100) / 100

/** The system size stored with the quote (from the battery and panel lines). */
export function planSize(p: ReadyPlan): SystemSize {
  const battery = p.lines
    .filter((l) => l.kind === 'battery')
    .reduce((t, l) => t + firstNumber(l.spec, 'kWh') * l.qty, 0)
  const panels = p.lines.filter((l) => l.kind === 'panels')
  const panelCount = panels.reduce((t, l) => t + l.qty, 0)
  const panelW = panels.reduce((t, l) => t + firstNumber(l.spec, 'W') * l.qty, 0)
  return {
    inverterKva: p.inverterKva,
    batteryKwh: r2(battery),
    panelCount,
    panelKw: r2(panelW / 1000),
    backupHoursFullLoad: 0,
    realisticBackupHours: null,
  }
}

export type TenureFigures = {
  months: number
  deposit: number
  monthly: number
  totalPayable: number
}

/** Customer figures (in the included state): the card line and one row per tenure offered. */
export function cardFigures(p: ReadyPlan): {
  card: { deposit: number; monthly: number; months: number }
  tenures: TenureFigures[]
  fullPayment: number
} {
  const months = [...p.tenures].sort((a, b) => a - b)
  const tenures = months.map((m) => {
    const x = priceReadyPlan(p, m)
    return { months: m, deposit: x.deposit, monthly: x.monthly, totalPayable: x.totalPayable }
  })
  const cardMonths = months.includes(12) ? 12 : months[months.length - 1]!
  const card = tenures.find((t) => t.months === cardMonths)!
  return {
    card: { deposit: card.deposit, monthly: card.monthly, months: cardMonths },
    tenures,
    fullPayment: priceReadyPlan(p, cardMonths).fullPayment,
  }
}
