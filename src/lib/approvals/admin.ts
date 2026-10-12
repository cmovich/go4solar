import 'server-only'

import { staffSignedUrl } from '@/lib/applications/server'
import { co2Avoided } from '@/lib/energy/currentSpend'
import type { QuoteResult } from '@/lib/pricing/types'
import { quoteReference } from '@/lib/quotes/quote'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import type { EnergyRecord } from '@/lib/waitlist/schema'

import { approvalContext, type ApprovalContext } from './server'
import { slaState } from './rules'

type AppRow = Database['public']['Tables']['applications']['Row']
type Flags = {
  incomeRatioAbove35?: boolean
  kycManualReview?: string[]
  noAutoPay?: boolean
  livenessDeferred?: boolean
}

export const QUEUE_FLAGS = {
  income: 'Payment above 35% of income',
  manual: 'KYC in manual review',
  noAutoPay: 'No auto-pay',
  liveness: 'Face check skipped',
} as const
export type QueueFlag = keyof typeof QUEUE_FLAGS

/** Ids of test accounts (profiles.is_test): reports leave them out unless asked. */
export async function testProfileIds(): Promise<Set<string>> {
  const { data } = await createAdminClient().from('profiles').select('id').eq('is_test', true)
  return new Set((data ?? []).map((p) => p.id))
}

export type QueueFilters = {
  /** Include test customers (profiles.is_test). Off by default. */
  includeTest?: boolean
  status?: string
  state?: string
  type?: string
  flag?: QueueFlag
  awaiting?: boolean
}

export type QueueRow = {
  id: string
  name: string
  state: string | null
  type: string
  status: AppRow['status']
  reference: string | null
  systemPrice: number | null
  submittedAt: string | null
  sla: { hoursLeft: number; overdue: boolean } | null
  flags: QueueFlag[]
  awaitingCustomer: boolean
  enteredBy: string | null
}

const flagsOf = (f: Flags): QueueFlag[] => [
  ...(f.incomeRatioAbove35 ? (['income'] as const) : []),
  ...(f.kycManualReview?.length ? (['manual'] as const) : []),
  ...(f.noAutoPay ? (['noAutoPay'] as const) : []),
  ...(f.livenessDeferred ? (['liveness'] as const) : []),
]

/** Applications for staff: submitted and decided ones, plus assisted drafts awaiting the customer. */
export async function applicationQueue(
  filters: QueueFilters,
  now = new Date(),
): Promise<QueueRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('applications')
    .select(
      'id, consumer_id, status, applicant_type, personal, credit_flags, submitted_at, entered_by, quote_id, created_at, business',
    )
    .order('created_at', { ascending: false })
    .limit(500)
  const testIds = filters.includeTest ? new Set<string>() : await testProfileIds()
  const apps = (data ?? []).filter(
    (a) => (a.status !== 'draft' || a.entered_by) && !testIds.has(a.consumer_id),
  )
  const quoteIds = apps.map((a) => a.quote_id).filter((x): x is string => Boolean(x))
  const staffIds = [
    ...new Set(apps.map((a) => a.entered_by).filter((x): x is string => Boolean(x))),
  ]
  const [quotes, staff] = await Promise.all([
    quoteIds.length ? admin.from('quotes').select('id, result').in('id', quoteIds) : { data: [] },
    staffIds.length
      ? admin.from('profiles').select('id, full_name, email').in('id', staffIds)
      : { data: [] },
  ])
  const priceOf = new Map(
    (quotes.data ?? []).map((q) => [q.id, (q.result as unknown as QuoteResult).systemPrice]),
  )
  const staffName = new Map(
    (staff.data ?? []).map((s) => [s.id, s.full_name ?? s.email ?? 'Staff']),
  )

  return apps
    .map((a): QueueRow => {
      const p = (a.personal ?? {}) as { firstName?: string; surname?: string; state?: string }
      const business = a.business as { registeredName?: string; businessName?: string } | null
      const person = [p.firstName, p.surname].filter(Boolean).join(' ')
      const open = a.status === 'submitted' || a.status === 'under_review'
      return {
        id: a.id,
        name:
          a.applicant_type === 'business'
            ? (business?.registeredName ?? business?.businessName ?? person)
            : person,
        state: p.state ?? null,
        type: a.applicant_type,
        status: a.status,
        reference: a.quote_id ? quoteReference(a.quote_id) : null,
        systemPrice: a.quote_id ? (priceOf.get(a.quote_id) ?? null) : null,
        submittedAt: a.submitted_at,
        sla: open ? slaState(a.submitted_at, now) : null,
        flags: flagsOf((a.credit_flags ?? {}) as Flags),
        awaitingCustomer: Boolean(a.entered_by) && a.status === 'draft',
        enteredBy: a.entered_by ? (staffName.get(a.entered_by) ?? 'Staff') : null,
      }
    })
    .filter(
      (r) =>
        (!filters.status || r.status === filters.status) &&
        (!filters.state || r.state === filters.state) &&
        (!filters.type || r.type === filters.type) &&
        (!filters.flag || r.flags.includes(filters.flag)) &&
        (!filters.awaiting || r.awaitingCustomer),
    )
}

export type ApplicationDetail = {
  ctx: ApprovalContext
  reference: string | null
  quote: QuoteResult | null
  plan: Plan | null
  checks: {
    id: string
    kind: string
    status: string
    attempt: number
    provider: string
    summary: Record<string, unknown>
    createdAt: string
  }[]
  documents: { kind: string; url: string | null; createdAt: string }[]
  agreements: {
    type: string
    signer: string
    signedAt: string
    url: string | null
    pdfSha256: string | null
  }[]
  guarantee: Database['public']['Tables']['guarantees']['Row'] | null
  guarantorChecks: { kind: string; status: string }[]
  payments: Database['public']['Tables']['payments']['Row'][]
  audit: { at: string; actor: string; action: string; detail: string }[]
  energy: { monthlySpend: number | null; co2KgPerYear: number | null; generator: string | null }
  enteredBy: string | null
  job: Database['public']['Tables']['jobs']['Row'] | null
}

/** Everything on the staff detail page (tabs). Files open through 10-minute signed links. */
export async function applicationDetail(id: string): Promise<ApplicationDetail | null> {
  const ctx = await approvalContext(id)
  if (!ctx) return null
  const admin = createAdminClient()
  const app = ctx.app
  const [quoteRes, checks, docs, agreements, guaranteeRes, payments] = await Promise.all([
    app.quote_id
      ? admin.from('quotes').select('id, result, plan, energy').eq('id', app.quote_id).maybeSingle()
      : { data: null },
    admin.from('kyc_checks').select('*').eq('subject_id', app.id).order('created_at'),
    admin
      .from('documents')
      .select('kind, storage_path, created_at')
      .eq('application_id', app.id)
      .order('created_at'),
    admin
      .from('agreements')
      .select('type, signer_name, signed_at, pdf_path, pdf_sha256')
      .eq('application_id', app.id)
      .order('signed_at'),
    admin
      .from('guarantees')
      .select('*')
      .eq('application_id', app.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('payments').select('*').eq('application_id', app.id).order('created_at'),
  ])
  const guarantee = guaranteeRes.data
  const [guarantorChecks, jobRes] = await Promise.all([
    guarantee
      ? admin
          .from('kyc_checks')
          .select('kind, status')
          .eq('subject_id', guarantee.id)
          .order('created_at')
      : { data: [] },
    ctx.loan
      ? admin.from('jobs').select('*').eq('loan_id', ctx.loan.id).maybeSingle()
      : { data: null },
  ])

  // Audit trail: the application, its KYC checks, its loan's job.
  const entityIds = [
    app.id,
    ...(checks.data ?? []).map((c) => c.id),
    ...(jobRes.data ? [jobRes.data.id] : []),
  ]
  const { data: auditRows } = await admin
    .from('audit_log')
    .select('created_at, actor_id, action, after')
    .in('entity_id', entityIds)
    .order('created_at', { ascending: false })
    .limit(100)
  const actorIds = [
    ...new Set(
      [...(auditRows ?? []).map((a) => a.actor_id), app.entered_by].filter((x): x is string =>
        Boolean(x),
      ),
    ),
  ]
  const { data: actors } = actorIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] }
  const who = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email ?? 'Staff']))

  const quote = quoteRes.data ? (quoteRes.data.result as unknown as QuoteResult) : null
  const plan = (quoteRes.data?.plan as Plan | undefined) ?? null
  const current = ((quoteRes.data?.energy ?? null) as EnergyRecord | null)?.current ?? null
  const energyRecord = (quoteRes.data?.energy ?? null) as EnergyRecord | null

  return {
    ctx,
    reference: app.quote_id ? quoteReference(app.quote_id) : null,
    quote,
    plan,
    checks: (checks.data ?? []).map((c) => ({
      id: c.id,
      kind: c.kind,
      status: c.status,
      attempt: c.attempt,
      provider: c.provider,
      summary: (c.result_summary ?? {}) as Record<string, unknown>,
      createdAt: c.created_at,
    })),
    documents: await Promise.all(
      (docs.data ?? []).map(async (d) => ({
        kind: d.kind,
        url: await staffSignedUrl(d.storage_path),
        createdAt: d.created_at,
      })),
    ),
    agreements: await Promise.all(
      (agreements.data ?? []).map(async (a) => ({
        type: a.type,
        signer: a.signer_name,
        signedAt: a.signed_at,
        url: a.pdf_path ? await staffSignedUrl(a.pdf_path) : null,
        pdfSha256: a.pdf_sha256,
      })),
    ),
    guarantee,
    guarantorChecks: (guarantorChecks.data ?? []) as { kind: string; status: string }[],
    payments: payments.data ?? [],
    audit: (auditRows ?? []).map((a) => ({
      at: a.created_at,
      actor: a.actor_id ? (who.get(a.actor_id) ?? 'Customer') : 'System',
      action: a.action,
      detail: a.after ? JSON.stringify(a.after).slice(0, 200) : '',
    })),
    energy: {
      monthlySpend: current?.monthlySpend ?? null,
      co2KgPerYear: current && plan ? co2Avoided(plan, current) : null,
      generator: energyRecord?.generator ?? null,
    },
    enteredBy: app.entered_by ? (who.get(app.entered_by) ?? 'Staff') : null,
    job: jobRes.data,
  }
}

export type AdminTiles = {
  waiting: number
  overdue: number
  approvedThisMonth: number
  jobsInProgress: number
  funders: { name: string; balance: number }[]
}

/** Back-office home tiles. */
export async function adminTiles(includeTest = false, now = new Date()): Promise<AdminTiles> {
  const admin = createAdminClient()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const [testIds, open, approved, jobs, loans, funders] = await Promise.all([
    includeTest ? Promise.resolve(new Set<string>()) : testProfileIds(),
    admin
      .from('applications')
      .select('consumer_id, submitted_at')
      .in('status', ['submitted', 'under_review']),
    admin
      .from('applications')
      .select('consumer_id')
      .eq('status', 'approved')
      .gte('decided_at', monthStart),
    admin.from('jobs').select('loan_id').neq('status', 'commissioned'),
    admin.from('loans').select('id, consumer_id'),
    admin.from('funders').select('name, balance_available, status, is_test').order('name'),
  ])
  const real = <T extends { consumer_id: string }>(rows: T[] | null) =>
    (rows ?? []).filter((r) => !testIds.has(r.consumer_id))
  const loanOwner = new Map((loans.data ?? []).map((l) => [l.id, l.consumer_id]))
  const waiting = real(open.data)
  return {
    waiting: waiting.length,
    overdue: waiting.filter((a) => slaState(a.submitted_at, now)?.overdue).length,
    approvedThisMonth: real(approved.data).length,
    jobsInProgress: (jobs.data ?? []).filter((j) => !testIds.has(loanOwner.get(j.loan_id) ?? ''))
      .length,
    funders: (funders.data ?? [])
      .filter((f) => f.status === 'active' && (includeTest || !f.is_test))
      .map((f) => ({ name: f.name, balance: Number(f.balance_available) })),
  }
}
