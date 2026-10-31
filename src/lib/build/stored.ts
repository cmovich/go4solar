import { z } from 'zod'

const storedSchema = z.object({
  kind: z.literal('builder'),
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
  }
}

/** How a customer-built system is named wherever a plan name would show. */
export const OWN_SYSTEM_LABEL = 'Your own system'

/** True when a quote or lead's `builder` value marks a system the customer built in /build. */
export function isOwnSystem(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'builder'
  )
}
