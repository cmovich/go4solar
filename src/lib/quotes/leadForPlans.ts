import 'server-only'

import { z } from 'zod'

import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'
import { isNgStateId, type NgStateId } from '@/lib/nigeria/states'
import { offeredTenures } from '@/lib/pricing/tenures'
import type { TenureMonths } from '@/lib/pricing/types'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'
import { gridFrom } from '@/lib/settings/schemas'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import type { EnergyRecord } from '@/lib/waitlist/schema'
import { currentVisitorHash } from '@/lib/waitlist/token'

import { buildEstimate, type Estimate } from './buildEstimate'
import { estimateIsStale } from './quote'

export type LeadRow = Database['public']['Tables']['waitlist_consumers']['Row']

export type LeadForPlans = {
  lead: LeadRow
  state: NgStateId
  estimate: Estimate
  energy: EnergyRecord | null
  validityDays: number
  /** Payment-plan lengths this customer may choose: in the estimate and still switched on. */
  tenures: TenureMonths[]
}

/** quote_validity_days from settings (default 7). */
export async function quoteValidityDays(): Promise<number> {
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('key', 'quote_validity_days')
    .maybeSingle()
  return z.number().int().min(1).max(90).safeParse(data?.value).data ?? 7
}

/**
 * The visitor's own lead (id + matching cookie token), with everything /plans needs. If the
 * stored estimate is older than the quote validity window it is re-priced with today's settings
 * and saved, so a customer never chooses from expired prices. Returns null when the lead does
 * not belong to this visitor or the details step is not finished yet.
 */
export async function loadLeadForPlans(id: string): Promise<LeadForPlans | null> {
  if (!z.uuid().safeParse(id).success) return null
  const hash = await currentVisitorHash()
  if (!hash) return null
  return loadLead(id, hash)
}

/**
 * Staff only (assisted entry): the same lead and prices without the visitor cookie. Callers must
 * have checked the assisted_entry permission.
 */
export async function loadLeadForStaff(id: string): Promise<LeadForPlans | null> {
  if (!z.uuid().safeParse(id).success) return null
  return loadLead(id, null)
}

async function loadLead(id: string, visitorHash: string | null): Promise<LeadForPlans | null> {
  const admin = createAdminClient()
  let query = admin.from('waitlist_consumers').select('*').eq('id', id)
  if (visitorHash) query = query.eq('visitor_token_hash', visitorHash)
  const { data: lead } = await query.maybeSingle()
  if (!lead || !lead.estimate || !lead.first_name || !lead.state || !isNgStateId(lead.state)) {
    return null
  }

  const [validityDays, settings] = await Promise.all([quoteValidityDays(), getQuoteSettings()])
  let estimate = lead.estimate as unknown as Estimate
  if (estimateIsStale(estimate.pricedAt ?? lead.created_at, validityDays)) {
    estimate = {
      ...buildEstimate(
        computeLoadTotals(lead.load_items as LoadItem[], {
          nightShare: settings.sizing.nightShare,
        }),
        lead.state,
        settings.minDepositShare,
        settings,
        gridFrom(lead.grid),
      ),
      pricedAt: new Date().toISOString(),
    }
    await admin.from('waitlist_consumers').update({ estimate }).eq('id', lead.id)
  }

  return {
    lead,
    state: lead.state,
    estimate,
    energy: (lead.energy as EnergyRecord | null) ?? null,
    validityDays,
    tenures: offeredTenures(
      estimate.pricingRateByTenure,
      offeredTenures(settings.pricing.pricingRateByTenure),
    ),
  }
}
