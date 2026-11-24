import 'server-only'

import { canTickConsent } from '@/lib/auth/staffRoles'
import { getMessagingProvider } from '@/lib/providers/messaging'
import { quoteReference } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import type { AppRole } from '@/lib/auth/staffRoles'

import type { ProfileValues } from '@/lib/tradeLenda/profile'
import { valuesOf } from '@/lib/tradeLenda/server'

import {
  exportReadiness,
  readinessLabel,
  type ConsentFunder,
  type FunderConsent,
  type RecordTicks,
} from './readiness'
import { consentWithdrawalEmail } from './withdrawal'

type Actor = { id: string; role: AppRole | null }
type Result = { ok: true; notified?: boolean } | { ok: false; error: string }

export type ConsentRow = FunderConsent & {
  funderName: string
  consentedBy: string | null
  consentNote: string | null
  withdrawnBy: string | null
  withdrawnNote: string | null
  funderToldAt: string | null
}

/** Funders a customer can agree to share with: every active funder (test funders on request). */
export async function consentFunders(includeTest: boolean) {
  let q = createAdminClient()
    .from('funders')
    .select('id, name, is_test, contact_email')
    .eq('status', 'active')
    .order('name')
  if (!includeTest) q = q.eq('is_test', false)
  const { data } = await q
  return (data ?? []).map((f) => ({ id: f.id, name: f.name, contactEmail: f.contact_email }))
}

/** This person's consents (who/when/notes as names). */
export async function loadConsents(waitlistId: string): Promise<ConsentRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('lead_funder_consents')
    .select('*, funders(name)')
    .eq('waitlist_id', waitlistId)
  const ids = [
    ...new Set((data ?? []).flatMap((c) => [c.consented_by, c.withdrawn_by]).filter(Boolean)),
  ] as string[]
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', ids)
    : { data: [] }
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? 'Staff']))
  return (data ?? []).map((c) => ({
    funderId: c.funder_id,
    funderName: (c.funders as { name: string } | null)?.name ?? 'Funder',
    consentedAt: c.consented_at,
    consentedBy: who.get(c.consented_by) ?? 'Staff',
    consentNote: c.consent_note,
    withdrawnAt: c.withdrawn_at,
    withdrawnBy: c.withdrawn_by ? (who.get(c.withdrawn_by) ?? 'Staff') : null,
    withdrawnNote: c.withdrawn_note,
    funderToldAt: c.funder_told_at,
  }))
}

async function audit(actor: Actor, action: string, id: string, before: unknown, after: unknown) {
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: actor.id,
      action,
      entity: 'lead_funder_consents',
      entity_id: id,
      before: (before ?? null) as Json,
      after: (after ?? null) as Json,
    })
}

const lagosDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  })

/**
 * Tick (on) or withdraw (off) the customer's consent to share their details with one funder.
 * Withdrawing after an export marks the person in that funder's batches ("Consent withdrawn" on
 * its dashboard) and emails the funder's contact to stop using and delete the details.
 */
export async function setConsent(
  input: { waitlistId: string; funderId: string; on: boolean; note?: string | null },
  actor: Actor,
): Promise<Result> {
  if (!canTickConsent(actor.role)) return { ok: false, error: 'You cannot record consent.' }
  const admin = createAdminClient()
  const note = input.note?.trim().slice(0, 500) || null
  const [{ data: lead }, { data: funder }, { data: before }] = await Promise.all([
    admin.from('waitlist_consumers').select('id, is_test').eq('id', input.waitlistId).maybeSingle(),
    admin.from('funders').select('id, name, contact_email').eq('id', input.funderId).maybeSingle(),
    admin
      .from('lead_funder_consents')
      .select('*')
      .eq('waitlist_id', input.waitlistId)
      .eq('funder_id', input.funderId)
      .maybeSingle(),
  ])
  if (!lead || !funder) return { ok: false, error: 'Entry or funder not found.' }
  const now = new Date().toISOString()

  if (input.on) {
    const row = {
      waitlist_id: input.waitlistId,
      funder_id: input.funderId,
      consented_at: now,
      consented_by: actor.id,
      consent_note: note,
      withdrawn_at: null,
      withdrawn_by: null,
      withdrawn_note: null,
      funder_told_at: null,
      is_test: lead.is_test,
      updated_at: now,
    }
    // Given again after a withdrawal: the same row becomes active again (history in the audit log).
    const { error } = before
      ? await admin
          .from('lead_funder_consents')
          .update(row)
          .eq('waitlist_id', input.waitlistId)
          .eq('funder_id', input.funderId)
      : await admin.from('lead_funder_consents').insert(row)
    if (error) return { ok: false, error: 'Could not save. Please try again.' }
    await audit(actor, 'lead_consent.on', input.waitlistId, before, {
      funder: funder.name,
      note,
    })
    return { ok: true }
  }

  if (!before || !before.consented_at || before.withdrawn_at)
    return { ok: false, error: 'There is no consent to withdraw for this funder.' }
  const { error } = await admin
    .from('lead_funder_consents')
    .update({ withdrawn_at: now, withdrawn_by: actor.id, withdrawn_note: note, updated_at: now })
    .eq('waitlist_id', input.waitlistId)
    .eq('funder_id', input.funderId)
  if (error) return { ok: false, error: 'Could not save. Please try again.' }

  // Already exported to this funder? Mark it there and tell the funder.
  const { data: funderBatches } = await admin
    .from('funder_batches')
    .select('id, number, version')
    .eq('funder_id', input.funderId)
  const batchOf = new Map((funderBatches ?? []).map((b) => [b.id, b]))
  const { data: items } = batchOf.size
    ? await admin
        .from('funder_batch_items')
        .select('id, batch_id')
        .eq('waitlist_id', input.waitlistId)
        .in('batch_id', [...batchOf.keys()])
    : { data: [] }
  const batches = [
    ...new Set(
      (items ?? []).map((i) => {
        const b = batchOf.get(i.batch_id)!
        return `${b.number}${b.version > 1 ? ` v${b.version}` : ''}`
      }),
    ),
  ]
  let notified = false
  if ((items ?? []).length > 0) {
    await admin
      .from('funder_batch_items')
      .update({ consent_withdrawn_at: now })
      .in(
        'id',
        (items ?? []).map((i) => i.id),
      )
    if (funder.contact_email) {
      const mail = consentWithdrawalEmail({
        funderName: funder.name,
        reference: quoteReference(input.waitlistId),
        batches,
        withdrawnOn: lagosDay(now),
      })
      const sent = await (
        await getMessagingProvider()
      ).send({
        channel: 'email',
        to: funder.contact_email,
        template: 'consent_withdrawn',
        payload: mail,
      })
      notified = sent.status !== 'failed'
      if (notified)
        await admin
          .from('lead_funder_consents')
          .update({ funder_told_at: now })
          .eq('waitlist_id', input.waitlistId)
          .eq('funder_id', input.funderId)
    }
  }
  await audit(actor, 'lead_consent.withdraw', input.waitlistId, before, {
    funder: funder.name,
    note,
    exportedIn: batches,
    funderEmailed: notified,
  })
  return { ok: true, notified }
}

/**
 * The edit page's consent block: every active funder (test funders for test entries), this
 * person's consent for it, the batches they were exported in, and what can go to it now.
 */
export async function consentPanel(input: {
  waitlistId: string
  isTest: boolean
  values: ProfileValues
  ticks: RecordTicks
}): Promise<ConsentFunder[]> {
  const admin = createAdminClient()
  const [funders, consents, { data: items }] = await Promise.all([
    consentFunders(input.isTest),
    loadConsents(input.waitlistId),
    admin
      .from('funder_batch_items')
      .select('funder_batches(number, version, funder_id)')
      .eq('waitlist_id', input.waitlistId),
  ])
  return funders.map((f) => {
    const c = consents.find((x) => x.funderId === f.id) ?? null
    const r = exportReadiness(input.values, input.ticks, consents, f.id)
    return {
      id: f.id,
      name: f.name,
      hasContactEmail: Boolean(f.contactEmail),
      consentedAt: c?.consentedAt ?? null,
      consentedBy: c?.consentedBy ?? null,
      consentNote: c?.consentNote ?? null,
      withdrawnAt: c?.withdrawnAt ?? null,
      withdrawnBy: c?.withdrawnBy ?? null,
      withdrawnNote: c?.withdrawnNote ?? null,
      funderToldAt: c?.funderToldAt ?? null,
      exportedIn: (items ?? []).flatMap((i) => {
        const b = i.funder_batches as { number: string; version: number; funder_id: string } | null
        return b && b.funder_id === f.id
          ? [`${b.number}${b.version > 1 ? ` v${b.version}` : ''}`]
          : []
      }),
      level: r.level,
      missing: r.level === 'basic' ? r.fullMissing : r.basicMissing,
    }
  })
}

/**
 * The waiting list's "Profile" column for these entries: "Full ready", "Basic ready" or how
 * many of the basic items are done (consent is per funder, so it is shown on the Edit page).
 */
export async function readinessByLead(ids: string[]): Promise<Record<string, string>> {
  const admin = createAdminClient()
  const out: Record<string, string> = {}
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const [{ data: leads }, { data: profiles }] = await Promise.all([
      admin.from('waitlist_consumers').select('*').in('id', chunk),
      admin.from('lead_profiles').select('*').in('waitlist_id', chunk),
    ])
    const byId = new Map((profiles ?? []).map((p) => [p.waitlist_id, p]))
    for (const l of leads ?? []) {
      const p = byId.get(l.id) ?? null
      out[l.id] = readinessLabel(valuesOf(l, p), {
        phoneVerifiedAt: p?.phone_verified_at ?? null,
        figuresAgreedAt: p?.figures_agreed_at ?? null,
      })
    }
  }
  return out
}
