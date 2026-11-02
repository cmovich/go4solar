import { z } from 'zod'

import { BUILDER_STORAGE_KEY } from '@/lib/build/store'
import { STORAGE_KEY as CALCULATOR_STORAGE_KEY } from '@/lib/calculator/store'

/** Progress saved in the browser that "Start again" (on the error screens) clears. */
export const SAVED_PROGRESS_KEYS = [BUILDER_STORAGE_KEY, CALCULATOR_STORAGE_KEY] as const

const reportSchema = z.object({
  kind: z.enum(['error', 'rejection', 'boundary']),
  path: z.string().startsWith('/').max(300),
  message: z.string().max(5000),
  digest: z.string().max(100).optional(),
})

export type ClientErrorReport = z.infer<typeof reportSchema>

/**
 * A crash report from a visitor's browser, made safe for the server log: the path without its
 * query, one line, at most 300 characters, and long digit runs (phones, NIN, BVN, cards) hidden.
 * Null when it is not a report. Pure.
 */
export function cleanClientError(input: unknown): ClientErrorReport | null {
  const p = reportSchema.safeParse(input)
  if (!p.success) return null
  const message = p.data.message
    .replace(/\s+/g, ' ')
    .replace(/\d{7,}/g, '[number]')
    .trim()
    .slice(0, 300)
  return {
    kind: p.data.kind,
    path: p.data.path.split(/[?#]/)[0]!,
    message,
    ...(p.data.digest ? { digest: p.data.digest } : {}),
  }
}
