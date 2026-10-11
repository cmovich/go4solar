import 'server-only'

import { z } from 'zod'

import type { CheckSummary } from '@/lib/applications/rules'
import { contactFromPersonal, notifyCustomer } from '@/lib/notify/customer'
import { refundDeposit } from '@/lib/payments/server'
import type { TenureMonths } from '@/lib/pricing/types'
import type { UnitCosts } from '@/lib/profit/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'

import {
  approvalAuthority,
  approvalBlockers,
  drawnFor,
  eligibleFunders,
  funderOptions,
  type FunderOption,
  type FunderRow,
  type LoanFigures,
} from './rules'

type Role = Database['public']['Enums']['app_role']
export type Actor = { id: string; role: Role | null }
type Result = { ok: true } | { ok: false; error: string; blockers?: string[] }

const DECIDERS: Role[] = ['credit_officer', 'super_admin']
const NOT_ALLOWED = {
  ok: false,
  error: 'Only a credit officer or super admin can do this.',
} as const

async function audit(
  actor: Actor,
  action: string,
  entity: string,
  id: string,
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
      before: before as Json,
      after: after as Json,
    })
}

async function settingNumber(key: string, fallback: number): Promise<number> {
  const { data } = await createAdminClient()
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  const n = Number(data?.value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export async function unitCostsRow(): Promise<UnitCosts & { minNetMarginShare: number }> {
  const { data } = await createAdminClient()
    .from('unit_costs')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  return {
    kycPerLoan: Number(data?.kyc_per_loan ?? 0),
    feePerInstalment: Number(data?.fee_per_instalment ?? 0),
    lossProvisionShare: Number(data?.loss_provision_share ?? 0),
    minNetMarginShare: Number(data?.min_net_margin_share ?? 0),
  }
}

export const approvalLimit = () => settingNumber('approval_limit_credit_officer', 3_000_000)

export type ApprovalContext = {
  app: Database['public']['Tables']['applications']['Row']
  loan: Database['public']['Tables']['loans']['Row'] | null
  figures: LoanFigures | null
  blockers: string[]
  options: FunderOption[]
  recordedFees: number
  limit: number
  minNetMarginShare: number
  drawn: number
}

/** Everything the approval panel and the approve action need, read fresh from the database. */
export async function approvalContext(applicationId: string): Promise<ApprovalContext | null> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle()
  if (!app) return null
  const [loanRes, payments, signed, guarantee, checks, fundersRes, costs, limit] =
    await Promise.all([
      admin.from('loans').select('*').eq('application_id', app.id).maybeSingle(),
      admin.from('payments').select('kind, status, fee').eq('application_id', app.id),
      admin
        .from('agreements')
        .select('id')
        .eq('application_id', app.id)
        .eq('type', 'consumer')
        .limit(1)
        .maybeSingle(),
      admin
        .from('guarantees')
        .select('status')
        .eq('application_id', app.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('kyc_checks')
        .select('kind, status, attempt')
        .eq('subject_id', app.id)
        .order('created_at'),
      admin.from('funders').select('*'),
      unitCostsRow(),
      approvalLimit(),
    ])
  const loan = loanRes.data
  const paid = (payments.data ?? []).filter((p) => p.status === 'success')
  const depositPaid = paid.some((p) => p.kind === 'deposit')
  const recordedFees = paid.reduce((s, p) => s + Number(p.fee ?? 0), 0)
  const figures: LoanFigures | null = loan
    ? {
        systemPrice: Number(loan.system_price),
        costPrice: Number(loan.cost_price),
        deposit: Number(loan.deposit),
        balance: Number(loan.balance),
        tenure: loan.tenure as TenureMonths,
      }
    : null
  const funders: FunderRow[] = (fundersRes.data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    annualRate: Number(f.annual_rate),
    minAmount: Number(f.min_amount),
    maxAmount: f.max_amount === null ? null : Number(f.max_amount),
    maxTenure: f.max_tenure,
    balanceAvailable: Number(f.balance_available),
    status: f.status,
  }))
  const blockers = approvalBlockers({
    status: app.status,
    applicantType: app.applicant_type === 'business' ? 'business' : 'individual',
    depositPaid,
    consumerSigned: Boolean(signed.data),
    guarantorSigned: guarantee.data?.status === 'signed',
    checks: (checks.data ?? []) as CheckSummary[],
    livenessDeferred: Boolean(
      (app.credit_flags as { livenessDeferred?: boolean } | null)?.livenessDeferred,
    ),
  })
  if (!loan) blockers.push('No loan record (deposit not paid)')
  const options = figures
    ? funderOptions(eligibleFunders(funders, figures), figures, costs, {
        recordedFees,
        minNetMarginShare: costs.minNetMarginShare,
      })
    : []
  return {
    app,
    loan,
    figures,
    blockers,
    options,
    recordedFees,
    limit,
    minNetMarginShare: costs.minNetMarginShare,
    drawn: figures ? drawnFor(figures) : 0,
  }
}

// ------------------------------------------------------------ approve
export async function approveApplication(input: {
  applicationId: string
  funderId: string
  actor: Actor
}): Promise<Result> {
  const { actor } = input
  if (!actor.role || !DECIDERS.includes(actor.role)) return NOT_ALLOWED
  const ctx = await approvalContext(input.applicationId)
  if (!ctx) return { ok: false, error: 'Application not found.' }
  if (ctx.blockers.length)
    return { ok: false, error: 'Not ready to approve.', blockers: ctx.blockers }
  const option = ctx.options.find((o) => o.funder.id === input.funderId)
  if (!option || !ctx.loan || !ctx.figures)
    return { ok: false, error: 'That funder is not eligible for this loan.' }
  const authority = approvalAuthority({
    role: actor.role,
    amount: ctx.figures.balance,
    limit: ctx.limit,
    netShare: option.netShare,
    minNetMarginShare: ctx.minNetMarginShare,
  })
  if (!authority.allowed) return { ok: false, error: authority.reasons.join(' ') }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const snapshot = {
    stage: 'approved',
    at: now,
    funderId: option.funder.id,
    funderName: option.funder.name,
    funderAnnualRate: option.funder.annualRate,
    recordedFees: ctx.recordedFees,
    netShare: option.netShare,
    profit: option.profit,
  }
  // Claim the loan first (only one approval can win), then draw on the funder.
  const { data: claimed } = await admin
    .from('loans')
    .update({
      status: 'approved',
      funder_id: option.funder.id,
      profit_snapshot: snapshot as unknown as Json,
      approved_by: actor.id,
      approved_at: now,
      drawn: ctx.drawn,
    })
    .eq('id', ctx.loan.id)
    .eq('status', 'pending_approval')
    .select('id')
  if (!claimed?.length) return { ok: false, error: 'This loan has already been decided.' }

  const { data: balanceAfter, error: drawError } = await admin.rpc('draw_from_funder', {
    p_funder: option.funder.id,
    p_amount: ctx.drawn,
  })
  if (drawError || balanceAfter === null) {
    // Undo the claim: the funder could not cover the draw (balance changed since the page loaded).
    await admin
      .from('loans')
      .update({
        status: 'pending_approval',
        funder_id: null,
        profit_snapshot: null,
        approved_by: null,
        approved_at: null,
        drawn: null,
      })
      .eq('id', ctx.loan.id)
    return { ok: false, error: 'That funder no longer has enough balance. Pick another.' }
  }
  await admin.from('funder_draws').insert({
    funder_id: option.funder.id,
    loan_id: ctx.loan.id,
    amount: ctx.drawn,
    balance_after: Number(balanceAfter),
    created_by: actor.id,
  })
  await admin
    .from('applications')
    .update({
      status: 'approved',
      decided_by: actor.id,
      decided_at: now,
      assigned_funder_id: option.funder.id,
    })
    .eq('id', ctx.app.id)
  await audit(
    actor,
    'application.approve',
    'applications',
    ctx.app.id,
    { status: ctx.app.status, loanStatus: ctx.loan.status },
    {
      status: 'approved',
      funderId: option.funder.id,
      drawn: ctx.drawn,
      netProfit: option.profit.netProfit,
      balanceAfter,
    },
  )
  const c = contactFromPersonal(ctx.app.personal)
  await notifyCustomer(c, 'application_approved', {
    subject: 'Your Go4Solar payment plan is approved',
    text:
      `Good news, ${c.firstName}! Your Go4Solar payment plan is approved. ` +
      'We will tell you who will install your system and when. Your monthly payments start one month after installation.',
  })
  return { ok: true }
}

// ------------------------------------------------------------ decline / more info
const reasonSchema = z.string().trim().min(3, 'Give a reason (the customer is told).').max(1000)
const OPEN: Database['public']['Enums']['application_status'][] = [
  'submitted',
  'under_review',
  'more_info',
]

export async function declineApplication(input: {
  applicationId: string
  reason: string
  actor: Actor
}): Promise<Result> {
  const { actor } = input
  if (!actor.role || !DECIDERS.includes(actor.role)) return NOT_ALLOWED
  const reason = reasonSchema.safeParse(input.reason)
  if (!reason.success) return { ok: false, error: reason.error.issues[0]!.message }
  const admin = createAdminClient()
  const now = new Date().toISOString()
  // Conditional update: only an open application can be declined, so the refund runs once.
  const { data: won } = await admin
    .from('applications')
    .update({
      status: 'declined',
      decided_by: actor.id,
      decided_at: now,
      decision_reason: reason.data,
    })
    .eq('id', input.applicationId)
    .in('status', OPEN)
    .select('id')
  if (!won?.length) return { ok: false, error: 'This application has already been decided.' }
  const refund = await refundDeposit(input.applicationId)
  await audit(actor, 'application.decline', 'applications', input.applicationId, null, {
    status: 'declined',
    reason: reason.data,
    refund,
  })
  if (!refund.ok)
    return { ok: false, error: `Declined, but the refund needs attention: ${refund.error}` }
  return { ok: true }
}

export async function requestMoreInfo(input: {
  applicationId: string
  message: string
  actor: Actor
}): Promise<Result> {
  const { actor } = input
  if (!actor.role || !DECIDERS.includes(actor.role)) return NOT_ALLOWED
  const msg = reasonSchema.safeParse(input.message)
  if (!msg.success) return { ok: false, error: 'Tell the customer what to fix.' }
  const admin = createAdminClient()
  const { data: won } = await admin
    .from('applications')
    .update({ status: 'more_info', more_info_request: msg.data })
    .eq('id', input.applicationId)
    .in('status', ['submitted', 'under_review'])
    .select('personal')
  if (!won?.length) return { ok: false, error: 'This application is not waiting for a decision.' }
  await audit(actor, 'application.more_info', 'applications', input.applicationId, null, {
    message: msg.data,
  })
  const c = contactFromPersonal(won[0]!.personal)
  await notifyCustomer(c, 'application_more_info', {
    subject: 'We need a little more information',
    text: `Hi ${c.firstName}, to finish reviewing your Go4Solar payment plan we need: ${msg.data} Open your dashboard to send it.`,
  })
  return { ok: true }
}

/** The customer says they have fixed what was asked: back to the review queue. */
export async function resubmitAfterMoreInfo(userId: string): Promise<Result> {
  const { data } = await createAdminClient()
    .from('applications')
    .update({ status: 'under_review' })
    .eq('consumer_id', userId)
    .eq('status', 'more_info')
    .select('id')
  return data?.length ? { ok: true } : { ok: false, error: 'Nothing to send back.' }
}

// ------------------------------------------------------------ manual review of KYC
export async function reviewKycCheck(input: {
  checkId: string
  outcome: 'clear' | 'fail'
  reason: string
  actor: Actor
}): Promise<Result> {
  const { actor } = input
  if (!actor.role || !DECIDERS.includes(actor.role)) return NOT_ALLOWED
  const reason = reasonSchema.safeParse(input.reason)
  if (!reason.success) return { ok: false, error: 'Give a reason for the record.' }
  const admin = createAdminClient()
  const { data: check } = await admin
    .from('kyc_checks')
    .select('*')
    .eq('id', input.checkId)
    .maybeSingle()
  if (!check || check.status !== 'manual_review')
    return { ok: false, error: 'Only checks in manual review can be reviewed.' }
  const review = {
    by: actor.id,
    at: new Date().toISOString(),
    outcome: input.outcome,
    reason: reason.data,
  }
  await admin
    .from('kyc_checks')
    .update({
      status: input.outcome === 'clear' ? 'passed' : 'failed',
      result_summary: { ...((check.result_summary ?? {}) as object), review } as Json,
    })
    .eq('id', check.id)
    .eq('status', 'manual_review')
  await audit(
    actor,
    `kyc_check.${input.outcome}`,
    'kyc_checks',
    check.id,
    { status: check.status },
    review,
  )
  return { ok: true }
}
