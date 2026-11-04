'use server'

import { z } from 'zod'

import type { InvoiceData } from '@/lib/invoices/build'
import { quotationForBuilderLead, quotationForPlan } from '@/lib/invoices/server'
import type { TenureMonths } from '@/lib/pricing/types'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentVisitorHash } from '@/lib/waitlist/token'

type QuotationResult =
  { ok: true; quotation: InvoiceData } | { ok: false; reason: 'not_found' | 'sample' | 'not_ready' }

const leadInput = z.object({ leadId: z.uuid() })

/**
 * Prelaunch "Your quotation": the plan and deposit this visitor chose (12 months, as the
 * waiting-list estimate), or the system they built. No invoice number is used before launch.
 */
export async function quotationForLead(input: unknown): Promise<QuotationResult> {
  const p = leadInput.safeParse(input)
  const hash = await currentVisitorHash()
  if (!p.success || !hash) return { ok: false, reason: 'not_found' }
  const { data: lead } = await createAdminClient()
    .from('waitlist_consumers')
    .select('id, chosen_plan, deposit_share, builder, estimate')
    .eq('id', p.data.leadId)
    .eq('visitor_token_hash', hash)
    .maybeSingle()
  if (!lead) return { ok: false, reason: 'not_found' }
  const r = lead.builder
    ? await quotationForBuilderLead(lead.id, hash)
    : lead.chosen_plan
      ? await quotationForPlan({
          leadId: lead.id,
          plan: lead.chosen_plan as Plan,
          depositShare: Number(lead.deposit_share ?? 0.2),
          tenure: 12 as TenureMonths,
        })
      : ({ ok: false, reason: 'not_found' } as const)
  return r.ok ? { ok: true, quotation: r.invoice } : { ok: false, reason: r.reason }
}

/** Prelaunch "Accept and continue": recorded on the lead, then the sign-up goes on as before. */
export async function acceptLeadQuotation(input: unknown): Promise<{ ok: boolean }> {
  const p = leadInput.safeParse(input)
  const hash = await currentVisitorHash()
  if (!p.success || !hash) return { ok: false }
  const { error } = await createAdminClient()
    .from('waitlist_consumers')
    .update({ quotation_accepted_at: new Date().toISOString() })
    .eq('id', p.data.leadId)
    .eq('visitor_token_hash', hash)
  // Before migration 0029 the column does not exist yet: the sign-up still goes on.
  if (error && !/quotation_accepted_at/.test(error.message)) {
    console.error('[quotation] accept failed:', error.message)
  }
  return { ok: true }
}
