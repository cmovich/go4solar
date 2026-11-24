import 'server-only'

import {
  canEditLeadProfile,
  canExport,
  canSendToFunder,
  isFunderLogin,
} from '@/lib/auth/staffRoles'
import { setConsent } from '@/lib/exports/consents'
import type { AppRole } from '@/lib/auth/session'
import type { QuoteResult, TenureMonths } from '@/lib/pricing/types'
import type { Estimate } from '@/lib/quotes/buildEstimate'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import { quoteReference } from '@/lib/quotes/quote'
import { loadReadyPlan, loadReadyPlans } from '@/lib/readyPlans/server'
import { systemTitle } from '@/lib/build/stored'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { Plan } from '@/lib/sizing/types'

import { batchTotals, nextBatchNumber } from './batch'
import { statusOf, type ListStatus } from './list'
import {
  customerFigures,
  go4solarFigures,
  monthlyRateOf,
  type LendingFigures,
  type LendingType,
} from './figures'
import { quoteBasis, readyPlanBasis, type PlanBasis } from './planBasis'
import {
  completeness,
  profileFormSchema,
  sendProblems,
  type ProfileValues,
  type Ticks,
} from './profile'
import { funderSnapshot, type FunderCustomer } from './snapshot'

/**
 * Trade Lenda on the server: profiles, the three ticks, batches and the funder's decisions. Every
 * read is with the service role after a role check in the caller or here; the funder's own pages
 * only ever receive `FunderCustomer` snapshots (see snapshot.ts).
 */

type Lead = Database['public']['Tables']['waitlist_consumers']['Row']
type ProfileRow = Database['public']['Tables']['lead_profiles']['Row']
export type Actor = { id: string; role: AppRole | null }

export const TL_PREFIX = 'TL'
/** Test batches: their own numbers, so real batches start at TL-Batch-001. */
export const TL_TEST_PREFIX = 'TLT'
const RESULT_ERROR = { ok: false as const, error: 'Something went wrong. Please try again.' }

export type TradeLendaFunder = {
  id: string
  name: string
  annualRate: number
  monthlyRate: number
  lendingTypes: LendingType[]
  defaultLendingType: LendingType
  sample: boolean
  balanceAvailable: number
}

/** The Trade Lenda funder row (test data uses the same funder, marked test). */
export async function tradeLendaFunder(): Promise<TradeLendaFunder | null> {
  const { data } = await createAdminClient()
    .from('funders')
    .select('id, name, annual_rate, lending_types, default_lending_type, sample, balance_available')
    .eq('name', 'Trade Lenda')
    .eq('is_test', false)
    .maybeSingle()
  if (!data) return null
  const types = (data.lending_types as string[]).filter(
    (t): t is LendingType => t === 'customer' || t === 'go4solar',
  )
  return {
    id: data.id,
    name: data.name,
    annualRate: Number(data.annual_rate),
    monthlyRate: monthlyRateOf(Number(data.annual_rate)),
    lendingTypes: types,
    defaultLendingType: data.default_lending_type === 'go4solar' ? 'go4solar' : 'customer',
    sample: data.sample,
    balanceAvailable: Number(data.balance_available),
  }
}

/** Every plan this entry could be financed with (the one it chose is first). */
export type PlanChoice = { kind: 'ready' | 'builder' | 'estimate'; ref: string; label: string }

export async function planChoices(lead: Lead): Promise<PlanChoice[]> {
  const out: PlanChoice[] = []
  const b = lead.builder as { kind?: string; plan?: { slug?: string; name?: string } } | null
  if (b?.kind === 'ready' && b.plan?.slug) {
    out.push({ kind: 'ready', ref: b.plan.slug, label: `${b.plan.name} (ready-made plan)` })
  } else if (b?.kind === 'builder' || (b && !b.kind)) {
    out.push({ kind: 'builder', ref: 'builder', label: 'Own system (system builder)' })
  }
  const est = lead.estimate as Estimate | null
  if (est?.plans) {
    for (const p of ['essential', 'comfort', 'independence'] as Plan[]) {
      if (est.plans[p])
        out.push({ kind: 'estimate', ref: p, label: `${PLAN_LABELS[p]} (calculator)` })
    }
  }
  // Staff quotations made for this phone number (attach one during the call).
  const { data: sq } = await createAdminClient()
    .from('staff_quotations')
    .select('public_code, total, created_at, customer_phone')
    .eq('customer_phone', lead.phone_e164)
    .order('created_at', { ascending: false })
    .limit(10)
  for (const q of sq ?? []) {
    out.push({
      kind: 'builder',
      ref: `sq:${q.public_code}`,
      label: `Staff quotation ${q.public_code} (${q.created_at.slice(0, 10)})`,
    })
  }
  for (const p of await loadReadyPlans({ activeOnly: true })) {
    if (!out.some((c) => c.kind === 'ready' && c.ref === p.slug)) {
      out.push({ kind: 'ready', ref: p.slug, label: `${p.name} (ready-made plan)` })
    }
  }
  return out
}

/** A staff quotation by its code (or its /q/<code> link), or null. */
export async function staffQuotationByCode(input: string) {
  const code = /\/q\/([A-Za-z0-9_-]+)/.exec(input)?.[1] ?? input.trim()
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(code)) return null
  const { data } = await createAdminClient()
    .from('staff_quotations')
    .select('public_code, builder')
    .eq('public_code', code)
    .maybeSingle()
  return data
}

/** The chosen plan priced for Trade Lenda (null when it cannot be priced). */
export async function basisFor(
  lead: Lead,
  kind: string | null,
  ref: string | null,
  depositShare: number,
  months: number,
): Promise<PlanBasis | null> {
  if (!kind || !ref || ![3, 6, 9, 12, 18, 24].includes(months)) return null
  const m = months as TenureMonths
  try {
    if (kind === 'ready') {
      const p = await loadReadyPlan(ref)
      return p && p.tenures.includes(m) ? readyPlanBasis(p, m) : null
    }
    if (kind === 'builder' && ref.startsWith('sq:')) {
      // A staff quotation attached during the call: its ready-made plan or its built system.
      const sq = await staffQuotationByCode(ref.slice(3))
      const b = sq?.builder as {
        kind?: string
        plan?: { slug?: string }
        quote?: QuoteResult
      } | null
      if (b?.kind === 'ready' && b.plan?.slug) {
        const p = await loadReadyPlan(b.plan.slug, false)
        return p && p.tenures.includes(m) ? readyPlanBasis(p, m) : null
      }
      if (!b?.quote?.snapshot) return null
      return quoteBasis(`Staff quotation ${ref.slice(3)}`, b.quote, depositShare, m, {
        [b.quote.snapshot.tenureMonths]: b.quote.snapshot.pricingRateAnnual,
      })
    }
    if (kind === 'builder') {
      const q = (lead.builder as { quote?: QuoteResult } | null)?.quote
      if (!q?.snapshot) return null
      return quoteBasis('Own system (system builder)', q, depositShare, m, {
        [q.snapshot.tenureMonths]: q.snapshot.pricingRateAnnual,
      })
    }
    if (kind === 'estimate') {
      const est = lead.estimate as Estimate | null
      const plan = est?.plans?.[ref as Plan]
      if (!est || !plan) return null
      return quoteBasis(
        `${PLAN_LABELS[ref as Plan]} (calculator)`,
        plan.quote,
        depositShare,
        m,
        est.pricingRateByTenure ?? {},
      )
    }
  } catch {
    return null
  }
  return null
}

export function figuresFor(
  basis: PlanBasis,
  type: LendingType,
  depositShare: number,
  months: number,
  monthlyRate: number,
): LendingFigures {
  return type === 'customer'
    ? customerFigures({ price: basis.priceInFull, depositShare, months, monthlyRate })
    : go4solarFigures({ priceInFull: basis.priceInFull, quoted: basis.quoted, months, monthlyRate })
}

/** The business details saved with a waiting-list entry (name and the contact's role). */
function businessOf(lead: Lead): { name: string | null; role: string | null } {
  const b = (lead.business ?? {}) as { businessName?: string; role?: string }
  return { name: b.businessName?.trim() || null, role: b.role?.trim() || null }
}

export function valuesOf(lead: Lead, p: ProfileRow | null): ProfileValues {
  const b = businessOf(lead)
  return {
    customerType:
      lead.applicant_type === 'business' || lead.applicant_type === 'individual'
        ? lead.applicant_type
        : null,
    businessName: b.name,
    contactRole: b.role,
    whatsapp: lead.whatsapp_e164,
    email: lead.email,
    firstName: lead.first_name,
    surname: lead.surname,
    phone: lead.phone_e164,
    dateOfBirth: p?.date_of_birth ?? null,
    state: lead.state,
    lga: lead.lga,
    street: p?.street ?? null,
    landmark: p?.landmark ?? null,
    employmentType: p?.employment_type ?? null,
    incomeRange: p?.income_range ?? null,
    guarantorName: p?.guarantor_name ?? null,
    guarantorPhone: p?.guarantor_phone_e164 ?? null,
    guarantorRelationship: p?.guarantor_relationship ?? null,
    planKind: p?.plan_kind ?? null,
    planRef: p?.plan_ref ?? null,
    depositShare:
      p?.deposit_share === null || p?.deposit_share === undefined ? null : Number(p.deposit_share),
    months: p?.months ?? null,
  }
}

async function staffNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))]
  if (list.length === 0) return new Map()
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, full_name, email')
    .in('id', list)
  return new Map((data ?? []).map((p) => [p.id, p.full_name || p.email || 'Staff']))
}

export type ProfileView = {
  lead: Lead
  profile: ProfileRow | null
  values: ProfileValues
  completeness: ReturnType<typeof completeness>
  choices: PlanChoice[]
  funder: TradeLendaFunder | null
  /** The figures for each lending type Trade Lenda offers (null when the plan cannot be priced). */
  figures: Partial<Record<LendingType, LendingFigures>>
  ticks: Ticks & {
    phoneVerifiedBy: string | null
    phoneVerifiedNote: string | null
    consentBy: string | null
    consentNote: string | null
    figuresAgreedBy: string | null
    figuresAgreedNote: string | null
  }
  /** Batches this entry is in (number, version, type, decision). */
  batches: {
    number: string
    version: number
    lendingType: LendingType
    decision: string
    note: string | null
  }[]
}

export async function loadProfileView(waitlistId: string): Promise<ProfileView | null> {
  const admin = createAdminClient()
  const [{ data: lead }, { data: profile }, funder] = await Promise.all([
    admin.from('waitlist_consumers').select('*').eq('id', waitlistId).maybeSingle(),
    admin.from('lead_profiles').select('*').eq('waitlist_id', waitlistId).maybeSingle(),
    tradeLendaFunder(),
  ])
  if (!lead) return null
  const values = valuesOf(lead, profile)
  const basis = await basisFor(
    lead,
    values.planKind,
    values.planRef,
    values.depositShare ?? 0.2,
    values.months ?? 12,
  )
  const figures: ProfileView['figures'] = {}
  if (basis && funder && values.depositShare !== null && values.months !== null) {
    for (const t of funder.lendingTypes) {
      figures[t] = figuresFor(basis, t, values.depositShare, values.months, funder.monthlyRate)
    }
  }
  // Consent to share with Trade Lenda (migration 0043: one row per funder; withdrawn = none).
  const { data: tlConsent } = funder
    ? await admin
        .from('lead_funder_consents')
        .select('consented_at, consented_by, consent_note, withdrawn_at')
        .eq('waitlist_id', waitlistId)
        .eq('funder_id', funder.id)
        .maybeSingle()
    : { data: null }
  const consent = tlConsent && !tlConsent.withdrawn_at ? tlConsent : null
  const names = await staffNames([
    profile?.phone_verified_by,
    consent?.consented_by,
    profile?.figures_agreed_by,
  ])
  const { data: items } = await admin
    .from('funder_batch_items')
    .select('decision, decision_note, funder_batches(number, version, lending_type)')
    .eq('waitlist_id', waitlistId)
  return {
    lead,
    profile,
    values,
    completeness: completeness(values),
    choices: await planChoices(lead),
    funder,
    figures,
    ticks: {
      phoneVerifiedAt: profile?.phone_verified_at ?? null,
      phoneVerifiedBy: profile?.phone_verified_by
        ? (names.get(profile.phone_verified_by) ?? null)
        : null,
      phoneVerifiedNote: profile?.phone_verified_note ?? null,
      consentAt: consent?.consented_at ?? null,
      consentBy: consent?.consented_by ? (names.get(consent.consented_by) ?? null) : null,
      consentNote: consent?.consent_note ?? null,
      figuresAgreedAt: profile?.figures_agreed_at ?? null,
      figuresAgreedBy: profile?.figures_agreed_by
        ? (names.get(profile.figures_agreed_by) ?? null)
        : null,
      figuresAgreedNote: profile?.figures_agreed_note ?? null,
      figuresAgreed: (profile?.figures_agreed as LendingFigures | null) ?? null,
    },
    batches: (items ?? []).flatMap((i) => {
      const b = i.funder_batches as { number: string; version: number; lending_type: string } | null
      return b
        ? [
            {
              number: b.number,
              version: b.version,
              lendingType: (b.lending_type === 'go4solar' ? 'go4solar' : 'customer') as LendingType,
              decision: i.decision,
              note: i.decision_note,
            },
          ]
        : []
    }),
  }
}

async function audit(
  actor: Actor,
  action: string,
  entity: string,
  id: string | null,
  before: unknown,
  after: unknown,
) {
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: actor.id,
      action,
      entity,
      entity_id: id,
      before: (before ?? null) as Json,
      after: (after ?? null) as Json,
    })
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string }

/** Save the profile (super admin, Operations, Sales). Audited old → new. */
export async function saveProfile(
  waitlistId: string,
  input: unknown,
  actor: Actor,
): Promise<Result> {
  if (!canEditLeadProfile(actor.role)) return { ok: false, error: 'You cannot edit profiles.' }
  const p = profileFormSchema.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the form.', field: issue?.path.join('.') }
  }
  const f = p.data
  // A staff quotation pasted during the call (its link or code) becomes the plan.
  const attach = (input as { attachQuotation?: unknown })?.attachQuotation
  if (typeof attach === 'string' && attach.trim()) {
    const sq = await staffQuotationByCode(attach)
    if (!sq)
      return {
        ok: false,
        error: 'No staff quotation with that code or link.',
        field: 'attachQuotation',
      }
    f.planKind = 'builder'
    f.planRef = `sq:${sq.public_code}`
  }
  const admin = createAdminClient()
  const [{ data: lead }, { data: before }] = await Promise.all([
    admin.from('waitlist_consumers').select('*').eq('id', waitlistId).maybeSingle(),
    admin.from('lead_profiles').select('*').eq('waitlist_id', waitlistId).maybeSingle(),
  ])
  if (!lead) return { ok: false, error: 'This entry no longer exists.' }
  // Customer type and the business details live on the waiting-list entry (merged, so the
  // business screen's other answers stay).
  const businessPatch =
    f.customerType === 'business'
      ? { ...((lead.business ?? {}) as object), businessName: f.businessName, role: f.contactRole }
      : (lead.business ?? null)
  const leadPatch = {
    ...(f.customerType ? { applicant_type: f.customerType } : {}),
    business: businessPatch as Json,
    first_name: f.firstName,
    surname: f.surname,
    email: f.email,
    whatsapp_e164: f.whatsapp,
    state: f.state,
    lga: f.lga,
  }
  const row = {
    waitlist_id: waitlistId,
    other_names: f.otherNames,
    date_of_birth: f.dateOfBirth,
    street: f.street,
    landmark: f.landmark,
    employment_type: f.employmentType,
    employer: f.employer,
    job_title: f.jobTitle,
    income_range: f.incomeRange,
    guarantor_name: f.guarantorName,
    guarantor_phone_e164: f.guarantorPhone,
    guarantor_relationship: f.guarantorRelationship,
    guarantor_address: f.guarantorAddress,
    plan_kind: f.planKind,
    plan_ref: f.planRef,
    deposit_share: f.depositPct === null ? null : Math.round(f.depositPct * 100) / 10_000,
    months: f.months,
    is_test: lead.is_test,
    updated_by: actor.id,
  }
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    admin.from('waitlist_consumers').update(leadPatch).eq('id', waitlistId),
    admin.from('lead_profiles').upsert(row, { onConflict: 'waitlist_id' }),
  ])
  if (e1 || e2) {
    console.error('[trade-lenda] profile not saved:', (e1 ?? e2)!.message)
    return RESULT_ERROR
  }
  await audit(
    actor,
    'lead_profile.update',
    'lead_profiles',
    waitlistId,
    { lead: pick(lead, Object.keys(leadPatch)), profile: before },
    { lead: leadPatch, profile: row },
  )
  return { ok: true }
}

const pick = (o: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, o[k]]))

export type TickKind = 'phone' | 'consent' | 'figures'

/**
 * Tick or untick one of the three records (who and when are set here). "Figures agreed" stores
 * the figures for the chosen lending type as they are now.
 */
export async function setTick(
  waitlistId: string,
  input: { kind: TickKind; on: boolean; note?: string | null; lendingType?: LendingType },
  actor: Actor,
): Promise<Result> {
  if (!canEditLeadProfile(actor.role)) return { ok: false, error: 'You cannot edit profiles.' }
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('lead_profiles')
    .select('*')
    .eq('waitlist_id', waitlistId)
    .maybeSingle()
  if (!before) return { ok: false, error: 'Save the profile first.' }
  const now = new Date().toISOString()
  const note = input.note?.trim().slice(0, 500) || null
  let patch: Partial<ProfileRow>
  if (input.kind === 'phone') {
    patch = input.on
      ? { phone_verified_at: now, phone_verified_by: actor.id, phone_verified_note: note }
      : { phone_verified_at: null, phone_verified_by: null, phone_verified_note: note }
  } else if (input.kind === 'consent') {
    // Consent is per funder now (lead_funder_consents): this tick is Trade Lenda's.
    const funder = await tradeLendaFunder()
    if (!funder) return { ok: false, error: 'Trade Lenda is not set up.' }
    const r = await setConsent(
      { waitlistId, funderId: funder.id, on: input.on, note },
      { id: actor.id, role: actor.role },
    )
    return r.ok ? { ok: true } : r
  } else {
    if (!input.on) {
      patch = {
        figures_agreed_at: null,
        figures_agreed_by: null,
        figures_agreed_note: note,
        figures_agreed: null,
      }
    } else {
      const view = await loadProfileView(waitlistId)
      const figures = input.lendingType ? view?.figures[input.lendingType] : undefined
      if (!figures) return { ok: false, error: 'Choose the plan, deposit and months first.' }
      patch = {
        figures_agreed_at: now,
        figures_agreed_by: actor.id,
        figures_agreed_note: note,
        figures_agreed: figures as unknown as Json,
      }
    }
  }
  const { error } = await admin.from('lead_profiles').update(patch).eq('waitlist_id', waitlistId)
  if (error) return RESULT_ERROR
  await audit(
    actor,
    `lead_profile.${input.kind}.${input.on ? 'on' : 'off'}`,
    'lead_profiles',
    waitlistId,
    null,
    patch,
  )
  return { ok: true }
}

/** The funder-safe snapshot of one entry for a batch of this type, or the reasons it cannot go. */
async function snapshotFor(
  waitlistId: string,
  type: LendingType,
): Promise<{ ok: true; snapshot: FunderCustomer } | { ok: false; problems: string[] }> {
  const view = await loadProfileView(waitlistId)
  if (!view) return { ok: false, problems: ['Entry not found.'] }
  const current = view.figures[type] ?? null
  const problems = sendProblems(view.values, view.ticks, type, current)
  if (!current) problems.push('The plan cannot be priced for Trade Lenda.')
  if (problems.length > 0 || !current) return { ok: false, problems }
  const basis = await basisFor(
    view.lead,
    view.values.planKind,
    view.values.planRef,
    view.values.depositShare!,
    view.values.months!,
  )
  const p = view.profile!
  const at = (s: string | null) => (s ? s.slice(0, 10) : '')
  return {
    ok: true,
    snapshot: funderSnapshot({
      reference: quoteReference(view.lead.id),
      name: [view.lead.first_name, p.other_names, view.lead.surname].filter(Boolean).join(' '),
      phone: view.lead.phone_e164,
      whatsapp: view.lead.whatsapp_e164,
      email: view.lead.email,
      dateOfBirth: p.date_of_birth,
      address: {
        street: p.street,
        landmark: p.landmark,
        lga: view.lead.lga,
        state: view.lead.state,
      },
      work: {
        employmentType: p.employment_type,
        employer: p.employer,
        jobTitle: p.job_title,
        incomeRange: p.income_range,
      },
      applicantType: view.lead.applicant_type === 'business' ? 'business' : 'individual',
      business:
        view.lead.applicant_type === 'business' && view.values.businessName
          ? { name: view.values.businessName, contactRole: view.values.contactRole }
          : null,
      guarantor: {
        name: p.guarantor_name,
        phone: p.guarantor_phone_e164,
        relationship: p.guarantor_relationship,
        address: p.guarantor_address,
      },
      planLabel: basis!.label,
      items: basis!.items,
      figures: current,
      records: {
        verifiedByPhone: {
          by: view.ticks.phoneVerifiedBy ?? 'Staff',
          at: at(view.ticks.phoneVerifiedAt),
          note: view.ticks.phoneVerifiedNote,
        },
        consent: {
          by: view.ticks.consentBy ?? 'Staff',
          at: at(view.ticks.consentAt),
          note: view.ticks.consentNote,
        },
        figuresAgreed: {
          by: view.ticks.figuresAgreedBy ?? 'Staff',
          at: at(view.ticks.figuresAgreedAt),
          note: view.ticks.figuresAgreedNote,
        },
      },
    }),
  }
}

/** For each entry already in an active (not replaced) batch: that batch's number. */
async function activeBatchOf(ids: string[]): Promise<Map<string, string>> {
  const { data } = await createAdminClient()
    .from('funder_batch_items')
    .select('waitlist_id, funder_batches(number, version, replaced_by)')
    .in('waitlist_id', ids)
  const out = new Map<string, string>()
  for (const i of data ?? []) {
    const b = i.funder_batches as {
      number: string
      version: number
      replaced_by: string | null
    } | null
    if (b && !b.replaced_by)
      out.set(i.waitlist_id, `${b.number}${b.version > 1 ? ` v${b.version}` : ''}`)
  }
  return out
}

/** Send entries to Trade Lenda as a new numbered batch (super admin). */
export async function createBatch(
  input: { ids: string[]; lendingType: LendingType },
  actor: Actor,
): Promise<Result<{ id: string; number: string }>> {
  if (!canSendToFunder(actor.role))
    return { ok: false, error: 'Only a super admin can send to Trade Lenda.' }
  const funder = await tradeLendaFunder()
  if (!funder) return { ok: false, error: 'Trade Lenda is not set up in Funders.' }
  if (!funder.lendingTypes.includes(input.lendingType)) {
    return { ok: false, error: 'Trade Lenda does not lend that way (Admin → Funders).' }
  }
  const ids = [...new Set(input.ids)].slice(0, 200)
  if (ids.length === 0) return { ok: false, error: 'Choose at least one entry.' }
  // Someone already in an active (not replaced) batch cannot go in a new one: change their
  // details with "Send updated version" (same batch number, new version).
  const already = await activeBatchOf(ids)
  if (already.size > 0) {
    return {
      ok: false,
      error: `Not sent. ${[...already].map(([id, n]) => `${quoteReference(id)} was sent in ${n}`).join('; ')}: use "Send updated version" for that batch.`,
    }
  }
  const snaps: { id: string; snapshot: FunderCustomer; isTest: boolean }[] = []
  const refused: string[] = []
  const admin = createAdminClient()
  const { data: leads } = await admin.from('waitlist_consumers').select('id, is_test').in('id', ids)
  for (const id of ids) {
    const s = await snapshotFor(id, input.lendingType)
    if (!s.ok) refused.push(`${quoteReference(id)}: ${s.problems.join(' ')}`)
    else
      snaps.push({
        id,
        snapshot: s.snapshot,
        isTest: Boolean(leads?.find((l) => l.id === id)?.is_test),
      })
  }
  if (refused.length > 0) return { ok: false, error: `Not sent. ${refused.join(' ')}` }
  // Test data never mixes with real data, and never uses up real batch numbers: test batches
  // have their own series (TLT-Batch-001…); real batches start at TL-Batch-001.
  const isTest = snaps.every((s) => s.isTest)
  if (!isTest && snaps.some((s) => s.isTest)) {
    return { ok: false, error: 'Not sent: test entries cannot go in a batch with real customers.' }
  }
  const { data: existing } = await admin
    .from('funder_batches')
    .select('number')
    .eq('funder_id', funder.id)
    .eq('is_test', isTest)
  const number = nextBatchNumber(
    isTest ? TL_TEST_PREFIX : TL_PREFIX,
    (existing ?? []).map((b) => b.number),
  )
  const totals = batchTotals(
    input.lendingType,
    snaps.map((s) => s.snapshot),
  )
  const { data: batch, error } = await admin
    .from('funder_batches')
    .insert({
      funder_id: funder.id,
      number,
      version: 1,
      lending_type: input.lendingType,
      totals: totals as unknown as Json,
      created_by: actor.id,
      is_test: isTest,
    })
    .select('id')
    .single()
  if (error || !batch) return RESULT_ERROR
  const { error: itemsError } = await admin.from('funder_batch_items').insert(
    snaps.map((s) => ({
      batch_id: batch.id,
      waitlist_id: s.id,
      snapshot: s.snapshot as unknown as Json,
    })),
  )
  if (itemsError) {
    await admin.from('funder_batches').delete().eq('id', batch.id)
    return RESULT_ERROR
  }
  await audit(actor, 'funder_batch.send', 'funder_batches', batch.id, null, {
    number,
    lendingType: input.lendingType,
    customers: snaps.length,
  })
  return { ok: true, id: batch.id, number }
}

/** A new version of a batch (same number, same lending type) with today's profiles. */
export async function updateBatch(batchId: string, actor: Actor): Promise<Result<{ id: string }>> {
  if (!canSendToFunder(actor.role))
    return { ok: false, error: 'Only a super admin can send to Trade Lenda.' }
  const admin = createAdminClient()
  const { data: old } = await admin
    .from('funder_batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle()
  if (!old) return { ok: false, error: 'Batch not found.' }
  if (old.replaced_by) return { ok: false, error: 'A newer version of this batch exists.' }
  const type: LendingType = old.lending_type === 'go4solar' ? 'go4solar' : 'customer'
  const { data: items } = await admin
    .from('funder_batch_items')
    .select('waitlist_id')
    .eq('batch_id', batchId)
  const snaps: { id: string; snapshot: FunderCustomer }[] = []
  const refused: string[] = []
  for (const { waitlist_id } of items ?? []) {
    const s = await snapshotFor(waitlist_id, type)
    if (!s.ok) refused.push(`${quoteReference(waitlist_id)}: ${s.problems.join(' ')}`)
    else snaps.push({ id: waitlist_id, snapshot: s.snapshot })
  }
  if (refused.length > 0) return { ok: false, error: `Not sent. ${refused.join(' ')}` }
  const { data: batch, error } = await admin
    .from('funder_batches')
    .insert({
      funder_id: old.funder_id,
      number: old.number,
      version: old.version + 1,
      lending_type: type,
      totals: batchTotals(
        type,
        snaps.map((s) => s.snapshot),
      ) as unknown as Json,
      created_by: actor.id,
      is_test: old.is_test,
    })
    .select('id')
    .single()
  if (error || !batch) return RESULT_ERROR
  await admin.from('funder_batch_items').insert(
    snaps.map((s) => ({
      batch_id: batch.id,
      waitlist_id: s.id,
      snapshot: s.snapshot as unknown as Json,
    })),
  )
  await admin.from('funder_batches').update({ replaced_by: batch.id }).eq('id', batchId)
  await audit(
    actor,
    'funder_batch.update',
    'funder_batches',
    batch.id,
    { id: batchId, version: old.version },
    {
      number: old.number,
      version: old.version + 1,
      lendingType: type,
    },
  )
  return { ok: true, id: batch.id }
}

// ---------------------------------------------------------------- what the funder sees

export type FunderBatchRow = {
  id: string
  number: string
  version: number
  lendingType: LendingType
  createdAt: string
  replaced: boolean
  customers: number
}

/**
 * Batches the viewer may see: a funder only its own funder's (from funder_users); a super admin
 * (View as Trade Lenda) Trade Lenda's. Test batches only when `includeTest`.
 */
export async function funderIdFor(actor: Actor, viewAs?: string | null): Promise<string | null> {
  // Super admin: "View as [funder]" (any funder; Trade Lenda when none is chosen).
  if (actor.role === 'super_admin') return viewAs ?? (await tradeLendaFunder())?.id ?? null
  const { data } = await createAdminClient()
    .from('funder_users')
    .select('funder_id')
    .eq('profile_id', actor.id)
    .maybeSingle()
  return data?.funder_id ?? null
}

export async function funderBatchList(
  actor: Actor,
  includeTest: boolean,
  viewAs?: string | null,
): Promise<FunderBatchRow[]> {
  const funderId = await funderIdFor(actor, viewAs)
  if (!funderId) return []
  let q = createAdminClient()
    .from('funder_batches')
    .select('id, number, version, lending_type, created_at, replaced_by, totals, is_test')
    .eq('funder_id', funderId)
    .order('created_at', { ascending: false })
  if (!includeTest) q = q.eq('is_test', false)
  const { data } = await q
  return (data ?? []).map((b) => ({
    id: b.id,
    number: b.number,
    version: b.version,
    lendingType: b.lending_type === 'go4solar' ? 'go4solar' : 'customer',
    createdAt: b.created_at,
    replaced: Boolean(b.replaced_by),
    customers: Number((b.totals as { customers?: number }).customers ?? 0),
  }))
}

export type FunderBatchView = FunderBatchRow & {
  versions: number
  totals: ReturnType<typeof batchTotals>
  items: {
    id: string
    customer: FunderCustomer
    decision: string
    note: string | null
    decidedAt: string | null
    consentWithdrawnAt: string | null
  }[]
}

/** One batch, funder-safe: its totals and its customers' snapshots (never anything else). */
export async function funderBatch(
  actor: Actor,
  batchId: string,
  /** anyFunder: Admin → Exports (super admin, Operations) sees every funder's batches. */
  opts: { anyFunder?: boolean; viewAs?: string | null } = {},
): Promise<FunderBatchView | null> {
  const staff = opts.anyFunder === true && canExport(actor.role)
  const funderId = staff ? null : await funderIdFor(actor, opts.viewAs)
  if (!staff && !funderId) return null
  const admin = createAdminClient()
  let q = admin
    .from('funder_batches')
    .select('id, number, version, lending_type, created_at, replaced_by, totals, funder_id')
    .eq('id', batchId)
  if (funderId) q = q.eq('funder_id', funderId)
  const { data: b } = await q.maybeSingle()
  if (!b) return null
  const [{ data: items }, { count }] = await Promise.all([
    admin
      .from('funder_batch_items')
      .select('id, snapshot, decision, decision_note, decided_at, consent_withdrawn_at')
      .eq('batch_id', batchId)
      .order('created_at'),
    admin
      .from('funder_batches')
      .select('id', { count: 'exact', head: true })
      .eq('funder_id', b.funder_id)
      .eq('number', b.number),
  ])
  const totals = b.totals as unknown as ReturnType<typeof batchTotals>
  return {
    id: b.id,
    number: b.number,
    version: b.version,
    lendingType: b.lending_type === 'go4solar' ? 'go4solar' : 'customer',
    createdAt: b.created_at,
    replaced: Boolean(b.replaced_by),
    customers: totals.customers,
    versions: count ?? 1,
    totals,
    items: (items ?? []).map((i) => ({
      id: i.id,
      customer: i.snapshot as unknown as FunderCustomer,
      decision: i.decision,
      note: i.decision_note,
      decidedAt: i.decided_at,
      /** The customer withdrew consent to share with this funder after the export. */
      consentWithdrawnAt: i.consent_withdrawn_at,
    })),
  }
}

/** The funder marks one customer Approved / Declined / Needs info (audited, visible to us). */
export async function decideItem(
  actor: Actor,
  input: { itemId: string; decision: 'approved' | 'declined' | 'needs_info'; note: string | null },
): Promise<Result> {
  if (!isFunderLogin(actor.role)) return { ok: false, error: 'Only the funder decides.' }
  const funderId = await funderIdFor(actor)
  const admin = createAdminClient()
  const { data: item } = await admin
    .from('funder_batch_items')
    .select('id, decision, decision_note, funder_batches(funder_id, replaced_by)')
    .eq('id', input.itemId)
    .maybeSingle()
  const batch = item?.funder_batches as { funder_id: string; replaced_by: string | null } | null
  if (!item || !batch || batch.funder_id !== funderId) return { ok: false, error: 'Not found.' }
  if (batch.replaced_by)
    return { ok: false, error: 'This version was replaced: open the latest one.' }
  if (input.decision !== 'approved' && !input.note?.trim()) {
    return { ok: false, error: 'Add a note.', field: 'note' }
  }
  const patch = {
    decision: input.decision,
    decision_note: input.note?.trim().slice(0, 1000) || null,
    decided_by: actor.id,
    decided_at: new Date().toISOString(),
  }
  const { error } = await admin.from('funder_batch_items').update(patch).eq('id', input.itemId)
  if (error) return RESULT_ERROR
  await audit(
    actor,
    `funder_batch_item.${input.decision}`,
    'funder_batch_items',
    input.itemId,
    {
      decision: item.decision,
      note: item.decision_note,
    },
    patch,
  )
  return { ok: true }
}

export type ProfileListRow = {
  id: string
  reference: string
  name: string
  phone: string
  email: string | null
  state: string | null
  createdAt: string
  /** The sign-up was finished (false: they stopped part-way, e.g. after the phone number). */
  signUpComplete: boolean
  /** The plan or quote (from the profile, else what the waiting list has), or null. */
  plan: string | null
  done: number
  total: number
  missing: string[]
  hasProfile: boolean
  verified: boolean
  consent: boolean
  /** The lending type the customer agreed figures for (null: not yet). */
  agreedType: LendingType | null
  /** The amount Trade Lenda hands over for this customer, from the agreed figures. */
  agreedFinanced: number | null
  /** Current batches ("TL-Batch-001 v2"). */
  batches: string[]
  /** Trade Lenda's latest decision in a current batch (null: none yet). */
  decision: string | null
  status: ListStatus
  isTest: boolean
}

/** What a stored plan reference reads as in the list. */
function planLabel(kind: string | null, ref: string | null, readyNames: Map<string, string>) {
  if (!kind || !ref) return null
  if (kind === 'ready') return `${readyNames.get(ref) ?? ref} (ready-made plan)`
  if (kind === 'builder')
    return ref.startsWith('sq:') ? `Staff quotation ${ref.slice(3)}` : 'Own system'
  if (kind === 'estimate') return `${PLAN_LABELS[ref as Plan] ?? ref} (calculator)`
  return null
}

/**
 * EVERY real waiting-list entry (finished sign-up or not; cleared ones left out), with its profile
 * status (super admin / Operations / Sales). Test entries only with `includeTest`.
 */
export async function profileList(includeTest: boolean): Promise<ProfileListRow[]> {
  const admin = createAdminClient()
  const leads: Lead[] = []
  // Paged past the 1,000-row limit.
  for (let from = 0; ; from += 1000) {
    let q = admin
      .from('waitlist_consumers')
      .select('*')
      .is('cleared_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    if (!includeTest) q = q.eq('is_test', false)
    const { data } = await q
    leads.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const ids = leads.map((l) => l.id)
  const [{ data: profiles }, { data: items }, ready] = await Promise.all([
    ids.length
      ? admin.from('lead_profiles').select('*').in('waitlist_id', ids)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    ids.length
      ? admin
          .from('funder_batch_items')
          .select('waitlist_id, decision, decided_at, funder_batches(number, version, replaced_by)')
          .in('waitlist_id', ids)
      : Promise.resolve({ data: [] }),
    loadReadyPlans({ activeOnly: false }),
  ])
  const readyNames = new Map(ready.map((p) => [p.slug, p.name]))
  const byId = new Map((profiles ?? []).map((p) => [p.waitlist_id, p]))
  const tl = await tradeLendaFunder()
  const { data: consents } =
    tl && ids.length
      ? await admin
          .from('lead_funder_consents')
          .select('waitlist_id, withdrawn_at')
          .eq('funder_id', tl.id)
          .in('waitlist_id', ids)
      : { data: [] }
  const consented = new Set(
    (consents ?? []).filter((c) => !c.withdrawn_at).map((c) => c.waitlist_id),
  )
  return leads.map((l) => {
    const p = byId.get(l.id) ?? null
    const c = completeness(valuesOf(l, p))
    const agreed = (p?.figures_agreed as LendingFigures | null) ?? null
    const current = (items ?? []).filter((i) => {
      const b = i.funder_batches as { replaced_by: string | null } | null
      return i.waitlist_id === l.id && b && !b.replaced_by
    })
    const decided = current.filter((i) => i.decision !== 'pending')
    const own =
      systemTitle(l.builder) ??
      (l.chosen_plan ? `${PLAN_LABELS[l.chosen_plan as Plan] ?? l.chosen_plan} (calculator)` : null)
    const row = {
      id: l.id,
      reference: quoteReference(l.id),
      name: [l.first_name, l.surname].filter(Boolean).join(' ') || '—',
      phone: l.phone_e164,
      email: l.email,
      state: l.state,
      createdAt: l.created_at,
      signUpComplete: l.status === 'complete',
      plan: planLabel(p?.plan_kind ?? null, p?.plan_ref ?? null, readyNames) ?? own,
      done: c.done,
      total: c.total,
      missing: c.missing,
      hasProfile: Boolean(p),
      verified: Boolean(p?.phone_verified_at),
      consent: consented.has(l.id),
      agreedType: p?.figures_agreed_at && agreed ? agreed.lendingType : null,
      agreedFinanced: p?.figures_agreed_at && agreed ? agreed.financed : null,
      batches: current.flatMap((i) => {
        const b = i.funder_batches as { number: string; version: number } | null
        return b ? [`${b.number}${b.version > 1 ? ` v${b.version}` : ''}`] : []
      }),
      decision:
        [...decided].sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))[0]
          ?.decision ?? null,
      isTest: l.is_test,
    }
    return {
      ...row,
      status: statusOf({
        hasProfile: row.hasProfile,
        missing: row.missing.length,
        verified: row.verified,
        consent: row.consent,
        agreed: Boolean(row.agreedType),
        sent: current.length > 0,
        decided: decided.length > 0,
      }),
    }
  })
}

/** Every batch for the super admin's list (all versions, newest first). */
export async function adminBatchList(includeTest: boolean) {
  const funder = await tradeLendaFunder()
  if (!funder) return []
  return funderBatchList({ id: 'super', role: 'super_admin' }, includeTest)
}
