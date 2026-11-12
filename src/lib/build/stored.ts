import { z } from 'zod'

const fixedSchema = z.object({
  fullPayment: z.number(),
  fullDiscount: z.number(),
  extra: z.object({ state: z.string(), amount: z.number() }).nullable(),
})

const storedSchema = z.object({
  kind: z.enum(['builder', 'ready']),
  /** Ready-made plans only. */
  plan: z.object({ slug: z.string(), name: z.string() }).optional(),
  fixed: fixedSchema.optional(),
  notes: z.array(z.string()).optional(),
  sample: z.boolean().optional(),
  quote: z.object({
    systemPrice: z.number(),
    deposit: z.number(),
    monthly: z.number(),
    snapshot: z.object({ tenureMonths: z.number() }),
    lines: z.array(z.object({ name: z.string(), qty: z.number(), lineTotal: z.number() })),
    noMarkup: z.array(z.object({ label: z.string(), amount: z.number() })).optional(),
  }),
})

export type StoredBuild = {
  systemPrice: number
  deposit: number
  monthly: number
  months: number
  lines: { name: string; qty: number; lineTotal: number }[]
  /** Installation and delivery (never marked up). */
  extras: { label: string; amount: number }[]
  notes: string[]
  /** Priced with SAMPLE values: hide amounts from the customer. */
  sample: boolean
  /** "Your own system", or the ready-made plan's name. */
  title: string
  /** Ready-made plans: the pay-in-full price and any extra delivery (paid upfront). */
  fixed: z.infer<typeof fixedSchema> | null
}

/**
 * A system the customer built themselves (`builder` column on leads and quotes), decoded for
 * display: customer prices only, never costs. Null when the value is not a builder system. Pure.
 */
export function storedBuild(value: unknown): StoredBuild | null {
  const p = storedSchema.safeParse(value)
  if (!p.success) return null
  const q = p.data.quote
  return {
    systemPrice: q.systemPrice,
    deposit: q.deposit,
    monthly: q.monthly,
    months: q.snapshot.tenureMonths,
    lines: q.lines.map((l) => ({ name: l.name, qty: l.qty, lineTotal: l.lineTotal })),
    extras: q.noMarkup ?? [],
    notes: p.data.notes ?? [],
    sample: p.data.sample ?? true,
    title: titleOf(p.data),
    fixed: p.data.fixed ?? null,
  }
}

function titleOf(v: { kind: 'builder' | 'ready'; plan?: { name: string } }): string {
  return v.kind === 'ready' && v.plan ? v.plan.name : OWN_SYSTEM_LABEL
}

/** The name a stored system shows where a plan name would: the ready-made plan's, or "Your own system". */
export function systemTitle(value: unknown): string | null {
  const p = storedSchema.pick({ kind: true, plan: true }).safeParse(value)
  return p.success ? titleOf(p.data) : null
}

/** True for a ready-made plan (fixed bundle): customers never see the word "interest". */
export function isReadyPlan(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'ready'
  )
}

/** What ready-made plans say instead of "0% interest". */
export const FIXED_PRICE_LINE = 'One fixed price. No hidden charges.'

/** How a customer-built system is named wherever a plan name would show. */
export const OWN_SYSTEM_LABEL = 'Your own system'

/**
 * True when a quote or lead's `builder` value holds a stored system (built in /build, or a
 * ready-made plan) rather than one of the three sized plans.
 */
export function isOwnSystem(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const kind = (value as { kind?: unknown }).kind
  return kind === 'builder' || kind === 'ready'
}
