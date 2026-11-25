import 'server-only'

import { canExport } from '@/lib/auth/staffRoles'
import { splitMonthly } from '@/lib/funders/financing'
import { quoteReference } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { batchTotals, nextBatchNumber } from '@/lib/tradeLenda/batch'
import {
  customerFigures,
  go4solarFigures,
  monthlyRateOf,
  type LendingFigures,
  type LendingType,
} from '@/lib/tradeLenda/figures'
import type { PlanBasis } from '@/lib/tradeLenda/planBasis'
import { basisFor, loadProfileView, type Actor } from '@/lib/tradeLenda/server'
import {
  funderSafetyProblems,
  funderSnapshot,
  type FunderCustomer,
} from '@/lib/tradeLenda/snapshot'

import { loadConsents } from './consents'
import { exportFinancing, exportTotals, type ExportFinancing, type FunderTerms } from './financing'
import { leadPlan } from './leadPlan'
import { exportReadiness, FULL_EXTRA, type ExportLevel } from './readiness'

/**
 * The shared export queue (EXP-YYYY-NNNN; test entries EXPT-…): super admin and Operations add
 * people from both waiting-list tabs, choose a funder (+ lending type) and "Basic for all" or
 * "Full where possible", then export: a frozen, numbered batch for that funder (TL-Batch-…,
 * SP-Batch-…; test batches TLT-/SPT-), shown on the funder's dashboard.
 */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const FAILED = { ok: false as const, error: 'Something went wrong. Nothing was changed.' }
const NOT_ALLOWED = { ok: false as const, error: 'Only a super admin or Operations can export.' }

export type ExportMode = 'basic' | 'full-where-possible'

export type QueueFunder = {
  id: string
  name: string
  prefix: string | null
  annualRate: number
  lendingTypes: LendingType[]
  defaultLendingType: LendingType
  isTest: boolean
}

async function audit(actor: Actor, action: string, id: string | null, after: unknown) {
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: actor.id,
      action,
      entity: 'export_queues',
      entity_id: id,
      before: null,
      after: (after ?? null) as Json,
    })
}

/** Active funders to export to (test funders for the test queue). */
export async function exportFunders(isTest: boolean): Promise<QueueFunder[]> {
  let q = createAdminClient()
    .from('funders')
    .select('id, name, batch_prefix, annual_rate, lending_types, default_lending_type, is_test')
    .eq('status', 'active')
    .order('name')
  if (!isTest) q = q.eq('is_test', false)
  const { data } = await q
  return (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    prefix: f.batch_prefix,
    annualRate: Number(f.annual_rate),
    lendingTypes: ((f.lending_types as string[] | null) ?? ['go4solar']).filter(
      (t): t is LendingType => t === 'customer' || t === 'go4solar',
    ),
    defaultLendingType: f.default_lending_type === 'customer' ? 'customer' : 'go4solar',
    isTest: f.is_test,
  }))
}

/** The open (draft) queue for real or test entries, or null. */
export async function openQueue(isTest: boolean) {
  const { data } = await createAdminClient()
    .from('export_queues')
    .select('id, number, created_at, created_by')
    .eq('status', 'draft')
    .eq('is_test', isTest)
    .maybeSingle()
  return data
}

/** Add people to the open queue (made if there is none). Test and real never mix. */
export async function addToQueue(
  ids: string[],
  actor: Actor,
): Promise<Result<{ number: string; added: number }>> {
  if (!canExport(actor.role)) return NOT_ALLOWED
  const unique = [...new Set(ids)].slice(0, 500)
  if (unique.length === 0) return { ok: false, error: 'Choose at least one person.' }
  const admin = createAdminClient()
  const { data: leads } = await admin
    .from('waitlist_consumers')
    .select('id, is_test')
    .in('id', unique)
  if (!leads || leads.length !== unique.length) return { ok: false, error: 'Entry not found.' }
  const isTest = leads.every((l) => l.is_test)
  if (!isTest && leads.some((l) => l.is_test))
    return { ok: false, error: 'Test entries cannot go in a queue with real customers.' }

  let queue = await openQueue(isTest)
  if (!queue) {
    const { data: number } = await admin.rpc('next_export_number', { p_test: isTest })
    if (!number) return FAILED
    const { data: made, error } = await admin
      .from('export_queues')
      .insert({ number, status: 'draft', created_by: actor.id, is_test: isTest })
      .select('id, number, created_at, created_by')
      .single()
    // Someone else opened one at the same moment: use theirs.
    queue = error ? await openQueue(isTest) : made
    if (!queue) return FAILED
  }
  const { data: inQueue } = await admin
    .from('export_queue_items')
    .select('waitlist_id')
    .eq('queue_id', queue.id)
  const have = new Set((inQueue ?? []).map((i) => i.waitlist_id))
  const fresh = unique.filter((id) => !have.has(id))
  if (fresh.length > 0) {
    const levels = await possibleLevels(fresh)
    const { error } = await admin.from('export_queue_items').insert(
      fresh.map((id) => ({
        queue_id: queue.id,
        waitlist_id: id,
        level: levels.get(id) ?? 'basic',
        added_by: actor.id,
      })),
    )
    if (error) return FAILED
  }
  await audit(actor, 'export_queue.add', queue.id, { number: queue.number, added: fresh })
  return { ok: true, number: queue.number, added: fresh.length }
}

/** Remove one person from the open queue. */
export async function removeFromQueue(
  input: { queueId: string; waitlistId: string },
  actor: Actor,
): Promise<Result> {
  if (!canExport(actor.role)) return NOT_ALLOWED
  const admin = createAdminClient()
  const { data: q } = await admin
    .from('export_queues')
    .select('status')
    .eq('id', input.queueId)
    .maybeSingle()
  if (q?.status !== 'draft') return { ok: false, error: 'This queue was already exported.' }
  const { error } = await admin
    .from('export_queue_items')
    .delete()
    .eq('queue_id', input.queueId)
    .eq('waitlist_id', input.waitlistId)
  if (error) return FAILED
  await audit(actor, 'export_queue.remove', input.queueId, { removed: input.waitlistId })
  return { ok: true }
}

/** Full when everything (but consent) is there, else basic (consent is checked per funder). */
async function possibleLevels(ids: string[]): Promise<Map<string, ExportLevel>> {
  const out = new Map<string, ExportLevel>()
  for (const id of ids) {
    const view = await loadProfileView(id)
    if (!view) continue
    const r = exportReadiness(
      view.values,
      { phoneVerifiedAt: view.ticks.phoneVerifiedAt, figuresAgreedAt: view.ticks.figuresAgreedAt },
      [{ funderId: 'any', consentedAt: 'x', withdrawnAt: null }],
      'any',
    )
    out.set(id, r.level === 'full' ? 'full' : 'basic')
  }
  return out
}

function termsOf(f: QueueFunder, lendingType: LendingType): FunderTerms {
  if (f.prefix === 'TL')
    return { kind: 'trade-lenda', monthlyRate: monthlyRateOf(f.annualRate), lendingType }
  if (f.prefix === 'SP') return { kind: 'spewa', annualRate: f.annualRate }
  return { kind: 'rate', annualRate: f.annualRate }
}

/** The figures block every snapshot carries (Trade Lenda's own; others from the financing). */
function lendingFigures(
  basis: PlanBasis,
  terms: FunderTerms,
  lendingType: LendingType,
  depositShare: number,
  months: number,
  fin: ExportFinancing,
): LendingFigures {
  if (terms.kind === 'trade-lenda')
    return lendingType === 'customer'
      ? customerFigures({
          price: basis.priceInFull,
          depositShare,
          months,
          monthlyRate: terms.monthlyRate,
        })
      : go4solarFigures({
          priceInFull: basis.priceInFull,
          quoted: basis.quoted,
          months,
          monthlyRate: terms.monthlyRate,
        })
  return {
    lendingType,
    price: basis.priceInFull,
    depositShare,
    deposit: fin.deposit,
    financed: fin.financed,
    monthlyRate:
      fin.financed > 0 ? Math.round((fin.earnings / fin.financed / months) * 1e6) / 1e6 : 0,
    months,
    charge: fin.earnings,
    ...splitMonthly(fin.totalRepayment, months),
    totalRepayment: fin.totalRepayment,
    customerTotalPayable: basis.quoted.totalPayable,
    customerMonthly: basis.quoted.monthly,
  }
}

/** Deposit paid so far for this waiting-list person (their application's successful deposits). */
async function depositPaidFor(waitlistId: string): Promise<number> {
  const admin = createAdminClient()
  const { data: quotes } = await admin.from('quotes').select('id').eq('waitlist_id', waitlistId)
  const qids = (quotes ?? []).map((q) => q.id)
  if (qids.length === 0) return 0
  const { data: apps } = await admin.from('applications').select('id').in('quote_id', qids)
  const aids = (apps ?? []).map((a) => a.id)
  if (aids.length === 0) return 0
  const { data: pays } = await admin
    .from('payments')
    .select('amount')
    .in('application_id', aids)
    .eq('kind', 'deposit')
    .eq('status', 'success')
  return (pays ?? []).reduce((s, p) => s + Number(p.amount), 0)
}

export type QueueRow = {
  waitlistId: string
  reference: string
  name: string
  phone: string
  /** What this person can go as to the chosen funder (null: blocked). */
  level: ExportLevel | null
  /** Blocks this person (name, phone or consent missing; or a safety check). */
  problems: string[]
  /** Exported blank, never blocks: "Missing: landmark, email". */
  warnings: string[]
  /** Already in an active batch for this funder: use "Send updated version". */
  inBatch: string | null
}

/** One person's frozen snapshot for this funder, or why they cannot go. */
async function snapshotFor(
  waitlistId: string,
  funder: QueueFunder,
  lendingType: LendingType,
  mode: ExportMode,
): Promise<
  | { ok: true; snapshot: FunderCustomer; level: ExportLevel; warnings: string[] }
  | { ok: false; problems: string[] }
> {
  const view = await loadProfileView(waitlistId)
  if (!view) return { ok: false, problems: ['Entry not found.'] }
  const consents = await loadConsents(waitlistId)
  const ticks = {
    phoneVerifiedAt: view.ticks.phoneVerifiedAt,
    figuresAgreedAt: view.ticks.figuresAgreedAt,
  }
  const r = exportReadiness(view.values, ticks, consents, funder.id)
  // Only a name, a phone and consent for THIS funder block (Semako, 25 Nov 2026).
  if (!r.level) return { ok: false, problems: [`Needs: ${r.blockers.join(', ')}.`] }
  // "Basic for all": Basic. "Full where possible": whatever of the Full details is filled in.
  const level: ExportLevel =
    mode === 'basic' || r.fullMissing.length === FULL_EXTRA.length ? 'basic' : 'full'
  const v = view.values
  // The quote staff picked on the Edit page, else the one the person already has.
  const own = v.planRef ? null : leadPlan(view.lead)
  const planKind = v.planKind ?? own?.planKind ?? null
  const planRef = v.planRef ?? own?.planRef ?? null
  const depositShare = v.depositShare ?? own?.depositShare ?? 0.2
  const months = v.months ?? own?.months ?? 12
  const basis = await basisFor(view.lead, planKind, planRef, depositShare, months)
  const warnings = r.warnings.filter((w) => !(own && ['plan', 'deposit', 'months'].includes(w)))
  if (!basis) warnings.push('quote')
  const terms = termsOf(funder, lendingType)
  const fin = basis
    ? exportFinancing(basis, terms, {
        depositShare,
        months,
        depositPaid: await depositPaidFor(waitlistId),
      })
    : null
  const consent = consents.find((c) => c.funderId === funder.id)!
  const p = view.profile
  const at = (s: string | null | undefined) => (s ? s.slice(0, 10) : '')
  const by = (who: string | null | undefined, when: string | null | undefined) =>
    when ? (who ?? 'Staff') : ''
  const snapshot = funderSnapshot({
    reference: quoteReference(view.lead.id),
    name: [view.lead.first_name, p?.other_names, view.lead.surname].filter(Boolean).join(' '),
    phone: view.lead.phone_e164,
    whatsapp: view.lead.whatsapp_e164,
    email: view.lead.email,
    dateOfBirth: p?.date_of_birth ?? null,
    address: {
      street: p?.street ?? null,
      landmark: p?.landmark ?? null,
      lga: view.lead.lga,
      state: view.lead.state,
    },
    work: {
      employmentType: p?.employment_type ?? null,
      employer: p?.employer ?? null,
      jobTitle: p?.job_title ?? null,
      incomeRange: p?.income_range ?? null,
    },
    applicantType: view.lead.applicant_type === 'business' ? 'business' : 'individual',
    business:
      view.lead.applicant_type === 'business' && v.businessName
        ? { name: v.businessName, contactRole: v.contactRole }
        : null,
    guarantor: {
      name: p?.guarantor_name ?? null,
      phone: p?.guarantor_phone_e164 ?? null,
      relationship: p?.guarantor_relationship ?? null,
      address: p?.guarantor_address ?? null,
    },
    planLabel: basis?.label ?? '',
    items: basis?.items ?? [],
    figures: basis
      ? lendingFigures(basis, terms, lendingType, depositShare, months, fin!)
      : blankFigures(lendingType),
    ...(basis ? {} : { noQuote: true as const }),
    records: {
      verifiedByPhone: {
        by: by(view.ticks.phoneVerifiedBy, view.ticks.phoneVerifiedAt),
        at: at(view.ticks.phoneVerifiedAt),
        note: view.ticks.phoneVerifiedNote,
      },
      consent: {
        by: by(consent.consentedBy, consent.consentedAt),
        at: at(consent.consentedAt),
        note: consent.consentNote,
      },
      figuresAgreed: {
        by: by(view.ticks.figuresAgreedBy, view.ticks.figuresAgreedAt),
        at: at(view.ticks.figuresAgreedAt),
        note: view.ticks.figuresAgreedNote,
      },
    },
    level,
    ...(fin ? { financing: fin } : {}),
  })
  // Kept: never NIN/BVN, cost, margin or profit (a found word or cost figure still refuses).
  const problems = funderSafetyProblems(snapshot, basis ? [basis.cost] : [], {
    allow: funder.prefix === 'SP' ? ['spewa'] : [],
  })
  return problems.length > 0 ? { ok: false, problems } : { ok: true, snapshot, level, warnings }
}

/** A person exported without a quote: blank figures (the funder collects them). */
function blankFigures(lendingType: LendingType): LendingFigures {
  return {
    lendingType,
    price: 0,
    depositShare: 0,
    deposit: 0,
    financed: 0,
    monthlyRate: 0,
    months: 0,
    charge: 0,
    monthly: 0,
    instalments: [],
    totalRepayment: 0,
    customerTotalPayable: null,
    customerMonthly: null,
  }
}

const NO_FINANCING: ExportFinancing = {
  months: 0,
  deposit: 0,
  depositStatus: 'to be paid',
  depositPaid: 0,
  financed: 0,
  monthly: 0,
  totalRepayment: 0,
  earnings: 0,
}

/** For each person already in an active (not replaced) batch of THIS funder: its number. */
async function activeBatchFor(funderId: string, ids: string[]): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const { data: batches } = await admin
    .from('funder_batches')
    .select('id, number, version, replaced_by')
    .eq('funder_id', funderId)
  const live = new Map((batches ?? []).filter((b) => !b.replaced_by).map((b) => [b.id, b]))
  if (live.size === 0 || ids.length === 0) return new Map()
  const { data: items } = await admin
    .from('funder_batch_items')
    .select('waitlist_id, batch_id')
    .in('batch_id', [...live.keys()])
    .in('waitlist_id', ids)
  const out = new Map<string, string>()
  for (const i of items ?? []) {
    const b = live.get(i.batch_id)!
    out.set(i.waitlist_id, `${b.number}${b.version > 1 ? ` v${b.version}` : ''}`)
  }
  return out
}

/** The open queue's people, each with what they can go as to this funder. */
export async function queueView(input: {
  isTest: boolean
  funderId: string | null
  lendingType: LendingType | null
  mode: ExportMode
}) {
  const queue = await openQueue(input.isTest)
  if (!queue)
    return { queue: null, rows: [] as QueueRow[], funders: await exportFunders(input.isTest) }
  const admin = createAdminClient()
  const funders = await exportFunders(input.isTest)
  const funder = funders.find((f) => f.id === input.funderId) ?? null
  const { data: items } = await admin
    .from('export_queue_items')
    .select('waitlist_id, level, added_at')
    .eq('queue_id', queue.id)
    .order('added_at')
  const ids = (items ?? []).map((i) => i.waitlist_id)
  const { data: leads } = ids.length
    ? await admin
        .from('waitlist_consumers')
        .select('id, first_name, surname, phone_e164')
        .in('id', ids)
    : { data: [] }
  const inBatch = funder ? await activeBatchFor(funder.id, ids) : new Map<string, string>()
  const rows: QueueRow[] = []
  for (const id of ids) {
    const l = (leads ?? []).find((x) => x.id === id)
    let level: ExportLevel | null = null
    let problems: string[] = []
    let warnings: string[] = []
    if (funder && input.lendingType) {
      const s = await snapshotFor(id, funder, input.lendingType, input.mode)
      if (s.ok) {
        level = s.level
        warnings = s.warnings
      } else problems = s.problems
    }
    rows.push({
      waitlistId: id,
      reference: quoteReference(id),
      name: [l?.first_name, l?.surname].filter(Boolean).join(' ') || '—',
      phone: l?.phone_e164 ?? '',
      level,
      problems,
      warnings,
      inBatch: inBatch.get(id) ?? null,
    })
  }
  return { queue, rows, funders }
}

/**
 * Export the open queue to one funder: every person must be ready (consent for that funder,
 * details confirmed by phone, figures agreed, the basic fields) and not already in an active
 * batch of that funder. The batch is frozen and numbered with the funder's prefix.
 */
export async function exportQueue(
  input: { isTest: boolean; funderId: string; lendingType: LendingType; mode: ExportMode },
  actor: Actor,
): Promise<Result<{ batchId: string; number: string }>> {
  if (!canExport(actor.role)) return NOT_ALLOWED
  const admin = createAdminClient()
  const queue = await openQueue(input.isTest)
  if (!queue) return { ok: false, error: 'There is no open export queue.' }
  const funder = (await exportFunders(input.isTest)).find((f) => f.id === input.funderId)
  if (!funder) return { ok: false, error: 'Choose a funder.' }
  if (!funder.prefix)
    return { ok: false, error: `Set a batch prefix for ${funder.name} in Admin → Funders first.` }
  if (!funder.lendingTypes.includes(input.lendingType))
    return { ok: false, error: `${funder.name} does not lend that way (Admin → Funders).` }

  const { data: items } = await admin
    .from('export_queue_items')
    .select('waitlist_id')
    .eq('queue_id', queue.id)
  const ids = (items ?? []).map((i) => i.waitlist_id)
  if (ids.length === 0) return { ok: false, error: 'The queue is empty.' }
  const inBatch = await activeBatchFor(funder.id, ids)
  if (inBatch.size > 0)
    return {
      ok: false,
      error: `Not exported. ${[...inBatch].map(([id, n]) => `${quoteReference(id)} is in ${n}`).join('; ')}: remove them here and use "Send updated version" for that batch.`,
    }
  const snaps: { id: string; snapshot: FunderCustomer; level: ExportLevel }[] = []
  const refused: string[] = []
  for (const id of ids) {
    const s = await snapshotFor(id, funder, input.lendingType, input.mode)
    if (s.ok) snaps.push({ id, snapshot: s.snapshot, level: s.level })
    else refused.push(`${quoteReference(id)}: ${s.problems.join(' ')}`)
  }
  if (refused.length > 0) return { ok: false, error: `Not exported. ${refused.join(' ')}` }

  const prefix = input.isTest ? `${funder.prefix}T` : funder.prefix
  const { data: existing } = await admin
    .from('funder_batches')
    .select('number')
    .eq('funder_id', funder.id)
    .eq('is_test', input.isTest)
  const number = nextBatchNumber(
    prefix,
    (existing ?? []).map((b) => b.number).filter((n) => n.startsWith(`${prefix}-`)),
  )
  const totals = {
    ...batchTotals(
      input.lendingType,
      snaps.map((s) => s.snapshot),
    ),
    financing: exportTotals(
      snaps.map((s) => ({ level: s.level, financing: s.snapshot.financing ?? NO_FINANCING })),
    ),
  }
  const { data: batch, error } = await admin
    .from('funder_batches')
    .insert({
      funder_id: funder.id,
      number,
      version: 1,
      lending_type: input.lendingType,
      totals: totals as unknown as Json,
      created_by: actor.id,
      is_test: input.isTest,
      export_queue_id: queue.id,
    })
    .select('id')
    .single()
  if (error || !batch) return FAILED
  const { error: itemsError } = await admin.from('funder_batch_items').insert(
    snaps.map((s) => ({
      batch_id: batch.id,
      waitlist_id: s.id,
      snapshot: s.snapshot as unknown as Json,
      level: s.level,
    })),
  )
  if (itemsError) {
    await admin.from('funder_batches').delete().eq('id', batch.id)
    return FAILED
  }
  await admin
    .from('export_queues')
    .update({
      status: 'exported',
      batch_id: batch.id,
      closed_by: actor.id,
      closed_at: new Date().toISOString(),
    })
    .eq('id', queue.id)
  await audit(actor, 'export_queue.export', queue.id, {
    queue: queue.number,
    batch: number,
    funder: funder.name,
    lendingType: input.lendingType,
    people: snaps.length,
    basic: snaps.filter((s) => s.level === 'basic').length,
    full: snaps.filter((s) => s.level === 'full').length,
  })
  return { ok: true, batchId: batch.id, number }
}

/**
 * "Send updated version" for any funder's batch: the same number, the next version, every person
 * again with today's details at the best level now possible (Basic → Full once complete). The
 * old version is marked replaced.
 */
export async function updateExportBatch(
  batchId: string,
  actor: Actor,
): Promise<Result<{ id: string; number: string; version: number }>> {
  if (!canExport(actor.role)) return NOT_ALLOWED
  const admin = createAdminClient()
  const { data: old } = await admin
    .from('funder_batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle()
  if (!old) return { ok: false, error: 'Batch not found.' }
  if (old.replaced_by) return { ok: false, error: 'A newer version of this batch exists.' }
  const funder = (await exportFunders(old.is_test)).find((f) => f.id === old.funder_id)
  if (!funder) return { ok: false, error: 'This funder is not active.' }
  const lendingType: LendingType = old.lending_type === 'go4solar' ? 'go4solar' : 'customer'
  const { data: items } = await admin
    .from('funder_batch_items')
    .select('waitlist_id')
    .eq('batch_id', batchId)
  const snaps: { id: string; snapshot: FunderCustomer; level: ExportLevel }[] = []
  const refused: string[] = []
  for (const { waitlist_id } of items ?? []) {
    const s = await snapshotFor(waitlist_id, funder, lendingType, 'full-where-possible')
    if (s.ok) snaps.push({ id: waitlist_id, snapshot: s.snapshot, level: s.level })
    else refused.push(`${quoteReference(waitlist_id)}: ${s.problems.join(' ')}`)
  }
  if (refused.length > 0) return { ok: false, error: `Not sent. ${refused.join(' ')}` }
  const totals = {
    ...batchTotals(
      lendingType,
      snaps.map((s) => s.snapshot),
    ),
    financing: exportTotals(
      snaps.map((s) => ({ level: s.level, financing: s.snapshot.financing ?? NO_FINANCING })),
    ),
  }
  const { data: batch, error } = await admin
    .from('funder_batches')
    .insert({
      funder_id: old.funder_id,
      number: old.number,
      version: old.version + 1,
      lending_type: lendingType,
      totals: totals as unknown as Json,
      created_by: actor.id,
      is_test: old.is_test,
      export_queue_id: old.export_queue_id,
      onboarding_url: old.onboarding_url,
    })
    .select('id')
    .single()
  if (error || !batch) return FAILED
  const { error: itemsError } = await admin.from('funder_batch_items').insert(
    snaps.map((s) => ({
      batch_id: batch.id,
      waitlist_id: s.id,
      snapshot: s.snapshot as unknown as Json,
      level: s.level,
    })),
  )
  if (itemsError) {
    await admin.from('funder_batches').delete().eq('id', batch.id)
    return FAILED
  }
  await admin.from('funder_batches').update({ replaced_by: batch.id }).eq('id', batchId)
  await audit(actor, 'funder_batch.update', batch.id, {
    number: old.number,
    version: old.version + 1,
    funder: funder.name,
    basic: snaps.filter((s) => s.level === 'basic').length,
    full: snaps.filter((s) => s.level === 'full').length,
  })
  return { ok: true, id: batch.id, number: old.number, version: old.version + 1 }
}

/**
 * Discard the open queue: nothing is exported and no batch number is used (batch numbers are given
 * only on Export). The queue's own EXP number stays used, like a skipped invoice number. Audited.
 */
export async function discardQueue(queueId: string, actor: Actor): Promise<Result> {
  if (!canExport(actor.role)) return NOT_ALLOWED
  const { data: done } = await createAdminClient()
    .from('export_queues')
    .update({ status: 'discarded', closed_by: actor.id, closed_at: new Date().toISOString() })
    .eq('id', queueId)
    .eq('status', 'draft')
    .select('number')
  if (!done?.length) return { ok: false, error: 'This queue is no longer open.' }
  await audit(actor, 'export_queue.discard', queueId, { number: done[0]!.number })
  return { ok: true }
}
