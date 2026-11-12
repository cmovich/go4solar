'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { launchMode } from '@/config/site'
import { saveBuiltSystem } from '@/lib/build/save'
import { buildContactSchema } from '@/lib/build/schema'
import type { InvoiceData } from '@/lib/invoices/build'
import { ensureInvoiceForQuote, quotationForReadyPlan } from '@/lib/invoices/server'
import { NG_STATE_IDS, type NgStateId } from '@/lib/nigeria/states'
import { quoteValidityDays } from '@/lib/quotes/leadForPlans'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { loadDeliveryRows, loadReadyPlan, storedReadyPlan } from '@/lib/readyPlans/server'
import { originFor } from '@/lib/site/origin'
import { siteAnswersSchema } from '@/lib/wizard/questions'

const choiceSchema = z.object({
  slug: z.string().max(80),
  months: z.number().int(),
  state: z.enum(NG_STATE_IDS as [NgStateId, ...NgStateId[]]),
  site: siteAnswersSchema.default({}),
})
const NOT_FOUND = {
  ok: false as const,
  error: 'This plan is not available. Please choose another.',
}

/** The chosen plan as its stored system (price fixed: the site answers are notes only). */
async function chosen(input: unknown) {
  const p = choiceSchema.safeParse(input)
  if (!p.success) return null
  const plan = await loadReadyPlan(p.data.slug)
  if (!plan || !plan.tenures.includes(p.data.months)) return null
  return storedReadyPlan(plan, p.data.months, p.data.state, p.data.site, await loadDeliveryRows())
}

/**
 * "Your quotation" for a ready-made plan, before the customer gives any details. Nothing is
 * saved. While prices are SAMPLE there is no document (`doc: null`).
 */
export async function readyPlanQuotation(
  input: unknown,
): Promise<{ ok: true; doc: InvoiceData | null } | { ok: false; error: string }> {
  const stored = await chosen(input)
  if (!stored) return NOT_FOUND
  const r = await quotationForReadyPlan(stored)
  return { ok: true, doc: r.ok ? r.invoice : null }
}

/**
 * "Accept and apply": the customer's own details start the normal sign-up from this plan at its
 * fixed price. Live: the quote (accepted), its invoice, then the account step (phone code, ID
 * checks). Prelaunch: the sign-up entry and its confirmation, then the thank-you.
 */
export async function acceptReadyPlan(
  input: unknown,
): Promise<{ ok: true; next: string | null } | { ok: false; error: string; field?: string }> {
  const p = choiceSchema.extend({ contact: z.unknown() }).safeParse(input)
  if (!p.success) return NOT_FOUND
  const c = buildContactSchema.safeParse(p.data.contact)
  if (!c.success) {
    const issue = c.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check your details',
      field: issue?.path.at(-1)?.toString(),
    }
  }
  const h = await headers()
  const ip = clientIp(h)
  if (!(await hitRateLimit(`ready-plan:${ip}`, 20, '1 hour'))) {
    return {
      ok: false,
      error: 'Too many requests from your connection. Please try again in an hour.',
    }
  }
  const stored = await chosen(p.data)
  if (!stored) return NOT_FOUND
  const live = launchMode() === 'live'
  const saved = await saveBuiltSystem({
    stored,
    contact: c.data,
    live,
    ip,
    validityDays: await quoteValidityDays(),
    accepted: { enteredBy: null, channel: 'ready plan' },
  })
  if (!saved.ok) return saved
  if (saved.quoteId) {
    const issued = await ensureInvoiceForQuote(saved.quoteId, originFor(h))
    // The invoice never blocks the customer: My account issues it later if this fails.
    if (!issued.ok) console.error('[ready-plan] invoice not issued yet:', issued.reason)
    return { ok: true, next: `/account?quote=${saved.quoteId}` }
  }
  return { ok: true, next: null }
}
