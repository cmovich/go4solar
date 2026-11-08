'use server'

import { z } from 'zod'

import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'
import type { NgStateId } from '@/lib/nigeria/states'
import { isNgStateId } from '@/lib/nigeria/states'
import { buildEstimate, type Estimate } from '@/lib/quotes/buildEstimate'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'
import { gridFrom } from '@/lib/settings/schemas'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import {
  loadItemsSchema,
  type ApplicantType,
  type BusinessInput,
  type EnergyRecord,
} from '@/lib/waitlist/schema'
import { currentVisitorHash } from '@/lib/waitlist/token'
import { siteAnswersSchema, type SiteAnswers } from '@/lib/wizard/questions'

async function ownLead(id: string) {
  const hash = await currentVisitorHash()
  if (!hash || !z.uuid().safeParse(id).success) return null
  const { data } = await createAdminClient()
    .from('waitlist_consumers')
    .select('*')
    .eq('id', id)
    .eq('visitor_token_hash', hash)
    .maybeSingle()
  return data
}

/** Local form of a stored +234 number, as the phone screen shows it. */
const local = (e164: string | null) =>
  e164?.startsWith('+234') ? `0${e164.slice(4)}` : (e164 ?? '')

export type ResumedLead = {
  leadId: string
  items: LoadItem[]
  phone: { phone: string; whatsapp: string; same: boolean }
  email: string
  name: { firstName: string; surname: string; state: NgStateId; lga: string } | null
  applicantType: ApplicantType | null
  business: BusinessInput | null
  site: SiteAnswers
  energy: EnergyRecord | null
  estimate: Estimate | null
  plan: Plan | null
  depositShare: number | null
  readyWhen: 'now' | '30_days' | 'later' | null
}

/**
 * Picks the visitor's own sign-up back up (cookie checked) with every answer, so the journey
 * can return to the plans — or open one part to change — without asking anything again.
 */
export async function resumeLead(input: unknown): Promise<ResumedLead | null> {
  const p = z.object({ id: z.uuid() }).safeParse(input)
  if (!p.success) return null
  const row = await ownLead(p.data.id)
  if (!row) return null
  const state = row.state && isNgStateId(row.state) ? row.state : null
  return {
    leadId: row.id,
    items: (row.load_items as LoadItem[]) ?? [],
    phone: {
      phone: local(row.phone_e164),
      whatsapp: local(row.whatsapp_e164),
      same: !row.whatsapp_e164 || row.whatsapp_e164 === row.phone_e164,
    },
    email: row.email ?? '',
    name:
      row.first_name && state
        ? { firstName: row.first_name, surname: row.surname ?? '', state, lga: row.lga ?? '' }
        : null,
    applicantType:
      row.applicant_type === 'individual' || row.applicant_type === 'business'
        ? row.applicant_type
        : null,
    business: (row.business as BusinessInput | null) ?? null,
    site: siteAnswersSchema.safeParse(row.site ?? {}).data ?? {},
    energy: (row.energy as EnergyRecord | null) ?? null,
    estimate: (row.estimate as Estimate | null) ?? null,
    plan: (row.chosen_plan as Plan | null) ?? null,
    depositShare: row.deposit_share === null ? null : Number(row.deposit_share),
    readyWhen: row.ready_when ?? null,
  }
}

/**
 * "Change my appliances": the new list on the same sign-up, the plans priced again with every
 * other answer kept (state, grid, quote questions). Details are never asked again.
 */
export async function updateLeadItems(
  input: unknown,
): Promise<{ ok: true; estimate: Estimate } | { ok: false; error: string }> {
  const p = z.object({ id: z.uuid(), items: loadItemsSchema }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Please check the appliances on your list.' }
  const row = await ownLead(p.data.id)
  if (!row || !row.state || !isNgStateId(row.state)) {
    return { ok: false, error: 'Your session expired. Please start again.' }
  }
  const settings = await getQuoteSettings()
  let estimate: Estimate
  let totals
  try {
    totals = computeLoadTotals(p.data.items, { nightShare: settings.sizing.nightShare })
    estimate = {
      ...buildEstimate(
        totals,
        row.state,
        settings.minDepositShare,
        settings,
        gridFrom(row.grid),
        siteAnswersSchema.safeParse(row.site ?? {}).data ?? {},
      ),
      pricedAt: new Date().toISOString(),
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === 'LoadTooLargeError'
          ? 'Your load is larger than our standard systems. We will contact you about a custom quote.'
          : 'We could not size a system for this load. Please check your appliances.',
    }
  }
  const { error } = await createAdminClient()
    .from('waitlist_consumers')
    .update({
      load_items: p.data.items as unknown as Json,
      load_totals: totals as unknown as Json,
      estimate: estimate as unknown as Json,
    })
    .eq('id', row.id)
  if (error) return { ok: false, error: 'Could not save your appliances. Please try again.' }
  return { ok: true, estimate }
}
