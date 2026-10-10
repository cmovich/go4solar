'use server'

import { headers } from 'next/headers'

import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'
import { co2Avoided, currentEnergy, recommendTenure } from '@/lib/energy/currentSpend'
import {
  buildEstimate,
  monthlyByTenure,
  repriceEstimate,
  type Estimate,
} from '@/lib/quotes/buildEstimate'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWaitlistConfirmation } from '@/lib/waitlist/messages'
import {
  applicantStepSchema,
  contributionStepSchema,
  emailStepSchema,
  energyStepSchema,
  nameStepSchema,
  phoneStepSchema,
  planStepSchema,
  type EnergyRecord,
} from '@/lib/waitlist/schema'
import { currentVisitorHash, getOrCreateVisitorToken } from '@/lib/waitlist/token'

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string }

const SUBMITS_PER_HOUR = 20

function firstIssue(err: { issues: { path: PropertyKey[]; message: string }[] }): {
  error: string
  field?: string
} {
  const issue = err.issues[0]
  return { error: issue?.message ?? 'Please check your details', field: issue?.path[0]?.toString() }
}

/** Loads the visitor's own row (matching token hash) or returns null. */
async function ownRow(id: string) {
  const hash = await currentVisitorHash()
  if (!hash) return null
  const { data } = await createAdminClient()
    .from('waitlist_consumers')
    .select('*')
    .eq('id', id)
    .eq('visitor_token_hash', hash)
    .maybeSingle()
  return data
}

const EXPIRED = { ok: false, error: 'Your session expired. Please start again.' } as const

/** Step 4: phone + WhatsApp. Creates the (incomplete) lead and sets the visitor cookie. */
export async function savePhoneStep(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = phoneStepSchema.safeParse(input)
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) }
  const { phone, whatsapp, sameAsPhone, items } = parsed.data

  const ip = clientIp(await headers())
  if (!(await hitRateLimit(`waitlist:${ip}`, SUBMITS_PER_HOUR, '1 hour'))) {
    return {
      ok: false,
      error: 'Too many sign-ups from your connection. Please try again in an hour.',
    }
  }

  let totals
  try {
    totals = computeLoadTotals(items)
  } catch {
    return { ok: false, error: 'Please check the appliances on your list.', field: 'items' }
  }

  const admin = createAdminClient()
  const { hash } = await getOrCreateVisitorToken()

  // Same phone already on the list? Link it so admin sees the duplicate; never block.
  const { data: existing } = await admin
    .from('waitlist_consumers')
    .select('id')
    .eq('phone_e164', phone)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('waitlist_consumers')
    .insert({
      status: 'incomplete',
      visitor_token_hash: hash,
      phone_e164: phone,
      whatsapp_e164: sameAsPhone ? phone : (whatsapp ?? null),
      load_items: items,
      load_totals: totals,
      duplicate_of: existing?.id ?? null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[waitlist] insert failed:', error.message)
    return { ok: false, error: 'Something went wrong saving your number. Please try again.' }
  }
  return { ok: true, id: data.id }
}

/** Step 5: email. */
export async function saveEmailStep(input: unknown): Promise<ActionResult> {
  const parsed = emailStepSchema.safeParse(input)
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) }
  const row = await ownRow(parsed.data.id)
  if (!row) return EXPIRED

  const { error } = await createAdminClient()
    .from('waitlist_consumers')
    .update({ email: parsed.data.email })
    .eq('id', row.id)
  if (error) return { ok: false, error: 'Could not save your email. Please try again.' }
  return { ok: true }
}

/** Step 6: name, state, LGA, consent. Builds and stores the three estimates at the minimum deposit. */
export async function saveNameStep(input: unknown): Promise<ActionResult<{ estimate: Estimate }>> {
  const parsed = nameStepSchema.safeParse(input)
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) }
  const row = await ownRow(parsed.data.id)
  if (!row) return EXPIRED

  const settings = await getQuoteSettings()
  let estimate: Estimate
  try {
    estimate = buildEstimate(
      computeLoadTotals(row.load_items as LoadItem[]),
      parsed.data.state,
      settings.minDepositShare,
      settings,
    )
    estimate = { ...estimate, pricedAt: new Date().toISOString() }
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'LoadTooLargeError'
        ? 'Your load is larger than our standard systems. We will contact you about a custom quote.'
        : 'We could not size a system for this load. Please check your appliances.'
    return { ok: false, error: message }
  }

  const { error } = await createAdminClient()
    .from('waitlist_consumers')
    .update({
      first_name: parsed.data.firstName,
      surname: parsed.data.surname,
      state: parsed.data.state,
      lga: parsed.data.lga,
      consent: true,
      consent_at: new Date().toISOString(),
      estimate,
    })
    .eq('id', row.id)
  if (error) return { ok: false, error: 'Could not save your details. Please try again.' }
  return { ok: true, estimate }
}

/** Steps 7–8: who the solar is for, plus the business details on the business pathway. */
export async function saveApplicantStep(input: unknown): Promise<ActionResult> {
  const parsed = applicantStepSchema.safeParse(input)
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) }
  const row = await ownRow(parsed.data.id)
  if (!row) return EXPIRED

  const { error } = await createAdminClient()
    .from('waitlist_consumers')
    .update({
      applicant_type: parsed.data.applicantType,
      business: parsed.data.applicantType === 'business' ? parsed.data.business : null,
    })
    .eq('id', row.id)
  if (error) return { ok: false, error: 'Could not save those details. Please try again.' }
  return { ok: true }
}

/** Step 9: current energy spend (both pathways). Stores the answers and the computed figures. */
export async function saveEnergyStep(
  input: unknown,
): Promise<ActionResult<{ current: EnergyRecord['current'] }>> {
  const parsed = energyStepSchema.safeParse(input)
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) }
  const row = await ownRow(parsed.data.id)
  if (!row) return EXPIRED

  const { generator, weeklyFuelNaira, weeklyGridNaira, petrolShare } = parsed.data
  const known = weeklyFuelNaira !== null && weeklyGridNaira !== null
  const current = known
    ? currentEnergy(
        {
          generator,
          weeklyFuelNaira,
          weeklyGridNaira,
          fuelMix: petrolShare === undefined ? undefined : { petrolShare },
        },
        (await getQuoteSettings()).energy,
      )
    : null
  const energy: EnergyRecord = {
    source: 'weekly',
    generator,
    weeklyFuelNaira,
    weeklyGridNaira,
    petrolShare: petrolShare ?? null,
    current,
  }

  const { error } = await createAdminClient()
    .from('waitlist_consumers')
    .update({ energy })
    .eq('id', row.id)
  if (error) return { ok: false, error: 'Could not save those answers. Please try again.' }
  return { ok: true, current }
}

/** Step 10: chosen plan. */
export async function savePlanStep(input: unknown): Promise<ActionResult> {
  const parsed = planStepSchema.safeParse(input)
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) }
  const row = await ownRow(parsed.data.id)
  if (!row) return EXPIRED

  const { error } = await createAdminClient()
    .from('waitlist_consumers')
    .update({ chosen_plan: parsed.data.plan })
    .eq('id', row.id)
  if (error) return { ok: false, error: 'Could not save your choice. Please try again.' }
  return { ok: true }
}

/** Step 11 → 12: contribution and readiness. Completes the sign-up and sends the confirmation. */
export async function completeWaitlist(
  input: unknown,
): Promise<ActionResult<{ id: string; firstName: string }>> {
  const parsed = contributionStepSchema.safeParse(input)
  if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) }
  const row = await ownRow(parsed.data.id)
  if (!row) return EXPIRED
  if (!row.estimate || !row.chosen_plan || !row.first_name) {
    return { ok: false, error: 'Please choose a plan first.' }
  }

  const estimate = row.estimate as unknown as Estimate
  const plan = row.chosen_plan as Plan
  const chosen = repriceEstimate(estimate, plan, parsed.data.depositShare)
  // Repayment and carbon advice for the chosen plan, when the energy answers are known.
  const current = (row.energy as EnergyRecord | null)?.current ?? null
  const advice = current
    ? {
        monthlySpend: current.monthlySpend,
        recommendedTenure: recommendTenure(
          monthlyByTenure(chosen, estimate.pricingRateByTenure),
          current.monthlySpend,
        ),
        co2AvoidedKgPerYear: co2Avoided(plan, current),
      }
    : null
  const snapshot = {
    ...estimate,
    chosen: { ...chosen, plan, depositShare: parsed.data.depositShare, advice },
  }

  const { error } = await createAdminClient()
    .from('waitlist_consumers')
    .update({
      status: 'complete',
      deposit_share: parsed.data.depositShare,
      ready_when: parsed.data.readyWhen,
      estimate: snapshot,
    })
    .eq('id', row.id)
  if (error) return { ok: false, error: 'Could not finish your sign-up. Please try again.' }

  await sendWaitlistConfirmation({
    firstName: row.first_name,
    phoneE164: row.phone_e164,
    whatsappE164: row.whatsapp_e164,
    email: row.email,
    plan,
    depositShare: parsed.data.depositShare,
    systemPrice: chosen.quote.systemPrice,
    deposit: chosen.quote.deposit,
    monthly: chosen.quote.monthly,
    tenureMonths: chosen.quote.snapshot.tenureMonths,
  })
  return { ok: true, id: row.id, firstName: row.first_name }
}
