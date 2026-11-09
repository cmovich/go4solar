'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { launchMode } from '@/config/site'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { originFor } from '@/lib/site/origin'
import { acceptStaffQuotation } from '@/lib/staffQuotes/server'

type Result = { ok: true; next: string | null } | { ok: false; error: string; field?: string }

/**
 * "Accept and apply" on a quotation staff shared: the customer's own details start the normal
 * sign-up from this quotation (live: then the account step with the phone code and ID checks).
 */
export async function acceptSharedQuotation(input: unknown): Promise<Result> {
  const p = z.object({ code: z.string(), contact: z.unknown() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'This quotation could not be found.' }
  const h = await headers()
  const ip = clientIp(h)
  if (!(await hitRateLimit(`staffq:${ip}`, 20, '1 hour'))) {
    return {
      ok: false,
      error: 'Too many requests from your connection. Please try again in an hour.',
    }
  }
  return acceptStaffQuotation({
    code: p.data.code,
    contact: p.data.contact,
    live: launchMode() === 'live',
    ip,
    origin: originFor(h),
  })
}
