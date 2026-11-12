/**
 * Ready-made plans (fixed bundles). Priced by ./price.ts with a flat monthly rate, never by the
 * sizing engine. Amounts are naira; line `vendorCost` and `price` are line totals.
 */
export const LINE_KINDS = [
  'battery',
  'inverter',
  'panels',
  'controller',
  'cable',
  'breakers',
  'surge',
  'box',
  'accessories',
  'installation',
  'logistics',
] as const
export type LineKind = (typeof LINE_KINDS)[number]

export const SYSTEM_VOLTAGES = [12, 24, 48] as const
export type SystemVoltage = (typeof SYSTEM_VOLTAGES)[number]

export type ReadyLine = {
  kind: LineKind
  /** Customer-facing name ("Battery"). */
  name: string
  /** Customer-facing spec ("3.6 kWh lithium-ion 12 V"); may be empty. */
  spec: string
  qty: number
  /** What Go4Solar pays for the whole line (admin only, never shown to customers). */
  vendorCost: number
  /** Go4Solar's price for the whole line (never shown per line to customers). */
  price: number
  /** Optional price-list SKU, used by "Customise this plan". */
  sku?: string | null
}

export type ReadyPlan = {
  id?: string
  slug: string
  name: string
  tagline: string | null
  summary: string
  /** Optional extra tag ("Best seller"); the system voltage tag is always shown. */
  tag: string | null
  systemVoltage: SystemVoltage
  inverterKva: number
  /** site-media path, or null. */
  image: string | null
  lines: ReadyLine[]
  canPower: string[]
  backup: string[]
  depositShare: number
  /** Flat rate per month on the financed amount (0.05 = 5%). Admin only. */
  monthlyRate: number
  tenures: number[]
  /** Off the 12-month total payable when paying in full (0.25 = 25%). */
  fullDiscount: number
  /** State whose delivery is included in the price. */
  deliveryState: string
  /** Admin only. */
  adminNote: string | null
  sortOrder: number
  active: boolean
  /** SAMPLE until confirmed: no naira shown to customers. */
  sample: boolean
}
