'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { ensureInvoiceForQuote } from '@/lib/invoices/server'
import { originFor } from '@/lib/site/origin'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentVisitorHash } from '@/lib/waitlist/token'

type Result = { ok: true; next: string } | { ok: false; error: string }

/**
 * "Accept and continue" (live): the quotation becomes the numbered invoice G4S-INV-… and the
 * customer goes on to the account step (phone, sign-up, then NIN, BVN, face check).
 */
export async function acceptQuotation(input: unknown): Promise<Result> {
  const p = z.object({ quoteId: z.uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'This quotation could not be found.' }
  const hash = await currentVisitorHash()
  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('quotes')
    .select('id, anon_token_hash, status')
    .eq('id', p.data.quoteId)
    .maybeSingle()
  if (!quote || !hash || quote.anon_token_hash !== hash) {
    return { ok: false, error: 'This quotation could not be found.' }
  }
  const { error } = await admin
    .from('quotes')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', quote.id)
    .is('accepted_at', null)
  // Before migration 0029 the column does not exist yet: continue without recording it.
  if (error && !/accepted_at/.test(error.message)) {
    console.error('[quotation] accept failed:', error.message)
    return { ok: false, error: 'Could not accept the quotation. Please try again.' }
  }
  const issued = await ensureInvoiceForQuote(quote.id, originFor(await headers()))
  // The invoice never blocks the customer: My account issues it later if this fails.
  if (!issued.ok) console.error('[quotation] invoice not issued yet:', issued.reason)
  return { ok: true, next: `/account?quote=${quote.id}` }
}
