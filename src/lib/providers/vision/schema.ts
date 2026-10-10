import { z } from 'zod'

import { LIMITS } from '@/lib/load/totals'

const wattsSchema = z
  .number()
  .finite()
  .transform((n) => Math.round(n))
  .pipe(z.number().min(LIMITS.watts.min).max(LIMITS.watts.max))

/** What every vision adapter must return, and what the API route sends to the browser. */
export const visionResultSchema = z
  .object({
    /** Rated watts read from the label, or the midpoint of an estimate; null if unreadable. */
    watts: wattsSchema.nullable(),
    method: z.enum(['label', 'estimate', 'unreadable']),
    low: wattsSchema.optional(),
    high: wattsSchema.optional(),
    appliance: z.string().trim().max(80).optional(),
  })
  .refine((r) => r.low === undefined || r.high === undefined || r.low <= r.high, {
    message: 'low must not exceed high',
    path: ['low'],
  })
  .refine(
    (r) =>
      r.watts === null ||
      ((r.low === undefined || r.low <= r.watts) && (r.high === undefined || r.watts <= r.high)),
    { message: 'watts must sit inside the low–high range', path: ['watts'] },
  )

export type VisionResult = z.infer<typeof visionResultSchema>

/** Pull the first JSON object out of a model reply (plain, or inside a ```json fence). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}
