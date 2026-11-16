import { formatNaira } from '@/lib/money'

/**
 * SPEWA's price list (pure): the five price columns, reading the CSV SPEWA sends, what each item
 * is for the sizing engine and the builder, and the checks shown in admin.
 */

export const PRICE_COLUMNS = ['showroom', 'installer', 'level_b', 'level_a', 'big_dealer'] as const
export type PriceColumn = (typeof PRICE_COLUMNS)[number]

export const COLUMN_LABELS: Record<PriceColumn, string> = {
  showroom: 'Showroom',
  installer: 'Installer',
  level_b: 'Level B',
  level_a: 'Level A',
  big_dealer: 'Big dealer',
}

export const SPEWA_CATEGORIES = ['Lights', 'Batteries', 'Inverters', 'Solar panels', 'Other'] as const
export type SpewaCategory = (typeof SPEWA_CATEGORIES)[number]

export const SPEWA_KINDS = ['inverter', 'battery', 'panel', 'light', 'other'] as const
export type SpewaKind = (typeof SPEWA_KINDS)[number]

export type SpewaPrices = Record<PriceColumn, number | null>

export type SpewaMapping = {
  kind: SpewaKind
  /** Inverter rating, kW (the sizing engine treats it as kVA). */
  ratingKw: number | null
  /** Battery voltage (inverter: its battery voltage); null for high-voltage systems. */
  voltage: number | null
  highVoltage: boolean
  kwh: number | null
  /** Panel or light watts. */
  watts: number | null
}

export type SpewaItem = SpewaMapping & {
  id: string
  itemNo: number | null
  category: SpewaCategory
  code: string
  product: string
  brand: string | null
  warranty: string | null
  prices: SpewaPrices
  active: boolean
  sortOrder: number
}

export type ParsedSpewaRow = Omit<SpewaItem, 'id'>

const num = (s: string | undefined): number | null => {
  const t = (s ?? '').replace(/[₦,\s]/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const first = (re: RegExp, s: string): number | null => {
  const m = s.match(re)
  return m?.[1] ? Number(m[1]) : null
}
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** What an item is, from its category and product name. Admin can correct any of it. */
export function mapProduct(category: string, product: string): SpewaMapping {
  const p = product
  const highVoltage = /\bHV\b|high voltage/i.test(p)
  const volts = first(/(\d+(?:\.\d+)?)\s*V\b/i, p)
  const base: SpewaMapping = {
    kind: 'other',
    ratingKw: null,
    voltage: null,
    highVoltage,
    kwh: null,
    watts: null,
  }
  switch (category) {
    case 'Inverters':
      return {
        ...base,
        kind: 'inverter',
        ratingKw: first(/(\d+(?:\.\d+)?)\s*kW\b/i, p),
        voltage: highVoltage ? null : volts,
      }
    case 'Batteries': {
      const kwh = first(/(\d+(?:\.\d+)?)\s*kWh/i, p)
      const ah = first(/(\d+(?:\.\d+)?)\s*ah\b/i, p)
      return {
        ...base,
        kind: 'battery',
        voltage: highVoltage ? null : volts,
        kwh: kwh ?? (ah !== null && volts !== null ? round3((ah * volts) / 1000) : null),
      }
    }
    case 'Solar panels':
      return { ...base, kind: 'panel', watts: first(/(\d+(?:\.\d+)?)\s*W\b/, p) }
    case 'Lights':
      return { ...base, kind: 'light', watts: first(/(\d+(?:\.\d+)?)\s*W\b/, p) }
    default:
      return base
  }
}

/** One CSV line into fields (double quotes allowed, "" inside quotes = one quote). */
function csvFields(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((f) => f.trim())
}

const HEADER = [
  'no',
  'category',
  'code',
  'product',
  'brand',
  'warranty',
  ...PRICE_COLUMNS,
] as const

/** SPEWA's CSV (no, category, code, product, brand, warranty, five prices). No price = off. */
export function parseSpewaCsv(text: string): ParsedSpewaRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const head = csvFields(lines[0] ?? '').map((h) => h.toLowerCase())
  const index = Object.fromEntries(HEADER.map((h) => [h, head.indexOf(h)]))
  const missing = HEADER.filter((h) => index[h] === -1)
  if (missing.length > 0) throw new Error(`Missing column(s): ${missing.join(', ')}`)
  return lines.slice(1).map((line, i) => {
    const f = csvFields(line)
    const get = (h: (typeof HEADER)[number]) => f[index[h]!] ?? ''
    const raw = get('category')
    const category = (SPEWA_CATEGORIES as readonly string[]).includes(raw)
      ? (raw as SpewaCategory)
      : 'Other'
    const prices = Object.fromEntries(PRICE_COLUMNS.map((c) => [c, num(get(c))])) as SpewaPrices
    const itemNo = num(get('no'))
    return {
      itemNo: itemNo === null ? null : Math.round(itemNo),
      category,
      code: get('code'),
      product: get('product'),
      brand: get('brand') || null,
      warranty: get('warranty') || null,
      prices,
      ...mapProduct(category, get('product')),
      active: PRICE_COLUMNS.some((c) => prices[c] !== null),
      sortOrder: itemNo === null ? i + 1 : Math.round(itemNo),
    }
  })
}

export const priceOf = (item: Pick<SpewaItem, 'prices'>, column: PriceColumn): number | null =>
  item.prices[column]

/** The size the sizing engine and builder need, by kind (null = nothing needed). */
function missingSize(i: SpewaItem): string | null {
  if (i.kind === 'inverter' && !i.ratingKw) return 'Inverter size (kW) is missing.'
  if (i.kind === 'battery' && !i.kwh) return 'Battery size (kWh) is missing.'
  if (i.kind === 'panel' && !i.watts) return 'Panel watts are missing.'
  return null
}

/**
 * What admin should look at: a cheaper level priced above the one before it, a name whose kW
 * differs from the model code, a switched-on item missing the partner or selling price, a size
 * the sizing engine needs.
 */
export function itemFlags(
  i: SpewaItem,
  cols?: { partnerColumn: PriceColumn; sellingColumn: PriceColumn },
): string[] {
  const flags: string[] = []
  for (let k = 1; k < PRICE_COLUMNS.length; k++) {
    const hi = PRICE_COLUMNS[k - 1]!
    const lo = PRICE_COLUMNS[k]!
    const a = i.prices[hi]
    const b = i.prices[lo]
    if (a !== null && b !== null && b > a) {
      flags.push(
        `${COLUMN_LABELS[lo]} (${formatNaira(b)}) is higher than ${COLUMN_LABELS[hi]} (${formatNaira(a)}).`,
      )
    }
  }
  const named = first(/(\d+(?:\.\d+)?)\s*kW\b/i, i.product)
  const model = first(/-[A-Z]+\d+P(\d+(?:\.\d+)?)K/, i.product)
  if (i.kind === 'inverter' && named !== null && model !== null && named !== model) {
    flags.push(`The name says ${named} kW but the model code says ${model}K. Check which is right.`)
  }
  if (cols && i.active) {
    for (const c of new Set([cols.partnerColumn, cols.sellingColumn])) {
      if (i.prices[c] === null) {
        flags.push(`No ${COLUMN_LABELS[c]} price: this item cannot be quoted.`)
      }
    }
  }
  const size = missingSize(i)
  if (size) flags.push(size)
  return flags
}

/** A spewa_price_items row (numeric columns may come back as strings). */
export function itemFromRow(r: Record<string, unknown>): SpewaItem {
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
  const category = (SPEWA_CATEGORIES as readonly string[]).includes(String(r.category))
    ? (r.category as SpewaCategory)
    : 'Other'
  const kind = (SPEWA_KINDS as readonly string[]).includes(String(r.kind))
    ? (r.kind as SpewaKind)
    : 'other'
  return {
    id: String(r.id),
    itemNo: n(r.item_no),
    category,
    code: String(r.code),
    product: String(r.product),
    brand: (r.brand as string | null) ?? null,
    warranty: (r.warranty as string | null) ?? null,
    prices: Object.fromEntries(PRICE_COLUMNS.map((c) => [c, n(r[c])])) as SpewaPrices,
    kind,
    ratingKw: n(r.rating_kw),
    voltage: n(r.voltage),
    highVoltage: Boolean(r.high_voltage),
    kwh: n(r.kwh),
    watts: n(r.watts),
    active: Boolean(r.active),
    sortOrder: Number(r.sort_order ?? 0),
  }
}
