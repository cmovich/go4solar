'use server'

import { revalidatePath } from 'next/cache'

import { requireStaffWithMfa } from '@/lib/auth/roles'
import { computeLoadTotals } from '@/lib/load/totals'
import { co2Avoided, currentEnergy, recommendTenure } from '@/lib/energy/currentSpend'
import { buildEstimate, monthlyByTenure, repriceEstimate } from '@/lib/quotes/buildEstimate'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { lastExportAt } from '@/lib/waitlist/admin'
import { sendWaitlistConfirmation } from '@/lib/waitlist/messages'
import { assistedEntrySchema, type EnergyRecord } from '@/lib/waitlist/schema'

type StaffActionResult<T = Record<string, never>> =
  ({ ok: true } & T) | { ok: false; error: string; field?: string }

const EXPORT_WINDOW_HOURS = 24

export async function exportIsRecent(): Promise<boolean> {
  const at = await lastExportAt()
  return at !== null && Date.now() - new Date(at).getTime() < EXPORT_WINDOW_HOURS * 3600 * 1000
}

/**
 * Super admin only. Deletes every consumer and installer row. Allowed only when an export was
 * downloaded in the last 24 h and the word CLEAR was typed. Writes audit_log.
 */
export async function clearWaitlist(input: {
  confirmation: string
}): Promise<StaffActionResult<{ deleted: number }>> {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin')
    return { ok: false, error: 'Only a super admin can clear the waiting list.' }
  if (input.confirmation !== 'CLEAR') return { ok: false, error: 'Type CLEAR to confirm.' }
  if (!(await exportIsRecent())) {
    return { ok: false, error: 'Download a PDF or CSV export first (within the last 24 hours).' }
  }

  const admin = createAdminClient()
  const [{ count: consumers }, { count: installers }] = await Promise.all([
    admin.from('waitlist_consumers').select('id', { count: 'exact', head: true }),
    admin.from('waitlist_installers').select('id', { count: 'exact', head: true }),
  ])

  // Delete as the staff user so the super_admin RLS policy is what allows it.
  const supabase = await createClient()
  const { error: e1 } = await supabase.from('waitlist_consumers').delete().not('id', 'is', null)
  const { error: e2 } = await supabase.from('waitlist_installers').delete().not('id', 'is', null)
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)?.message ?? 'Delete failed' }

  await admin.from('audit_log').insert({
    actor_id: session.user!.id,
    action: 'waitlist.clear',
    entity: 'waitlist',
    entity_id: null,
    before: { consumers: consumers ?? 0, installers: installers ?? 0 },
    after: { consumers: 0, installers: 0 },
  })
  revalidatePath('/admin/waitlist')
  return { ok: true, deleted: (consumers ?? 0) + (installers ?? 0) }
}

/**
 * Staff with the assisted_entry permission enter a customer in one go (PRD "Assisted entry").
 * Records who entered it and through which channel; the customer still gets the confirmation.
 */
export async function assistedEntry(input: unknown): Promise<StaffActionResult<{ id: string }>> {
  const session = await requireStaffWithMfa()
  const supabase = await createClient()
  const { data: allowed } = await supabase.rpc('has_permission', { target: 'assisted_entry' })
  if (!allowed && session.role !== 'super_admin') {
    return { ok: false, error: 'You do not have the assisted-entry permission.' }
  }

  const parsed = assistedEntrySchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Check the form',
      field: issue?.path[0]?.toString(),
    }
  }
  const d = parsed.data

  let totals
  try {
    totals = computeLoadTotals(d.items)
  } catch {
    return { ok: false, error: 'Check the appliances on the list.', field: 'items' }
  }
  const settings = await getQuoteSettings()
  let estimate
  try {
    estimate = buildEstimate(totals, d.state, settings.minDepositShare, settings)
  } catch {
    return { ok: false, error: 'This load is outside our standard systems.' }
  }
  const chosen = repriceEstimate(estimate, d.plan, d.depositShare)
  const answers = d.energy
  const current =
    answers && answers.weeklyFuelNaira !== null && answers.weeklyGridNaira !== null
      ? currentEnergy(
          {
            generator: answers.generator,
            weeklyFuelNaira: answers.weeklyFuelNaira,
            weeklyGridNaira: answers.weeklyGridNaira,
            fuelMix:
              answers.petrolShare === undefined ? undefined : { petrolShare: answers.petrolShare },
          },
          settings.energy,
        )
      : null
  const energy: EnergyRecord | null = answers
    ? {
        source: 'weekly',
        generator: answers.generator,
        weeklyFuelNaira: answers.weeklyFuelNaira,
        weeklyGridNaira: answers.weeklyGridNaira,
        petrolShare: answers.petrolShare ?? null,
        current,
      }
    : null
  const advice = current
    ? {
        monthlySpend: current.monthlySpend,
        recommendedTenure: recommendTenure(
          monthlyByTenure(chosen, estimate.pricingRateByTenure),
          current.monthlySpend,
        ),
        co2AvoidedKgPerYear: co2Avoided(d.plan, current),
      }
    : null

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('waitlist_consumers')
    .select('id')
    .eq('phone_e164', d.phone)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('waitlist_consumers')
    .insert({
      status: 'complete',
      visitor_token_hash: `staff:${session.user!.id}`,
      phone_e164: d.phone,
      whatsapp_e164: d.whatsapp ?? d.phone,
      email: d.email || null,
      first_name: d.firstName,
      surname: d.surname,
      state: d.state,
      lga: d.lga,
      consent: true,
      consent_at: new Date().toISOString(),
      applicant_type: d.applicantType,
      business: d.applicantType === 'business' ? (d.business ?? null) : null,
      energy,
      load_items: d.items,
      load_totals: totals,
      chosen_plan: d.plan,
      deposit_share: d.depositShare,
      ready_when: d.readyWhen,
      estimate: {
        ...estimate,
        chosen: { ...chosen, plan: d.plan, depositShare: d.depositShare, advice },
      },
      duplicate_of: existing?.id ?? null,
      entered_by: session.user!.id,
      entry_channel: d.entryChannel,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  await admin.from('audit_log').insert({
    actor_id: session.user!.id,
    action: 'waitlist.assisted_entry',
    entity: 'waitlist_consumers',
    entity_id: data.id,
    after: { phone: d.phone, channel: d.entryChannel, plan: d.plan, depositShare: d.depositShare },
  })
  await sendWaitlistConfirmation({
    firstName: d.firstName,
    phoneE164: d.phone,
    whatsappE164: d.whatsapp ?? d.phone,
    email: d.email || null,
    plan: d.plan,
    depositShare: d.depositShare,
    systemPrice: chosen.quote.systemPrice,
    deposit: chosen.quote.deposit,
    monthly: chosen.quote.monthly,
    tenureMonths: chosen.quote.snapshot.tenureMonths,
  })
  revalidatePath('/admin/waitlist')
  return { ok: true, id: data.id }
}
