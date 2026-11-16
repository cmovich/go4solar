import 'server-only'

import { approvalContext, approveApplication, type Actor } from '@/lib/approvals/server'
import { lagosDate } from '@/lib/payments/lock'
import type { QuoteResult } from '@/lib/pricing/types'
import { quoteReference } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database, Json } from '@/lib/supabase/database.types'

import { applicantName } from './names'
import {
  canDecideFunderQueue,
  canRecordCheques,
  chequesSchema,
  queueDecisionSchema,
  repaymentSummary,
  type QueueDecision,
  type RepaymentSummary,
} from './rules'

export type { QueueDecision }

export { loadRoutingRules, routedDecisions, routedFunderName } from './route'

type QueueRow = Database['public']['Tables']['funder_queue']['Row']

async function audit(actor: Actor | null, action: string, id: string, after: unknown) {
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: actor?.id ?? null,
      action,
      entity: 'applications',
      entity_id: id,
      after: after as Json,
    })
}

/** The SPEWA queue row of an application (null: not routed, or before migration 0038). */
export async function queueRowFor(applicationId: string): Promise<QueueRow | null> {
  const { data } = await createAdminClient()
    .from('funder_queue')
    .select('*')
    .eq('application_id', applicationId)
    .maybeSingle()
  return data ?? null
}

export type DecisionResult = { id: string; ok: true } | { id: string; ok: false; error: string }

/**
 * Approve or decline files in the SPEWA queue, one or many. Approve = the final approval with
 * SPEWA as the funder (money drawn from SPEWA, customer told; test customers draw on the test
 * funder). Decline = back to the general queue (no refund, customer not told). Each file gets
 * its own audit row with who and when.
 */
export async function decideFunderQueue(
  input: unknown,
  actor: Actor,
): Promise<{ ok: false; error: string } | { ok: true; results: DecisionResult[] }> {
  if (!canDecideFunderQueue(actor.role))
    return { ok: false, error: 'Only the funder approver or a super admin can decide these files.' }
  const parsed = queueDecisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }
  const d = parsed.data
  const results: DecisionResult[] = []
  for (const id of [...new Set(d.ids)]) {
    results.push(
      d.decision === 'approve'
        ? await approveOne(id, actor)
        : await declineOne(id, d.reason, actor),
    )
  }
  return { ok: true, results }
}

async function approveOne(id: string, actor: Actor): Promise<DecisionResult> {
  const admin = createAdminClient()
  const row = await queueRowFor(id)
  if (!row) return { id, ok: false, error: 'This file is not in the SPEWA queue.' }
  if (row.decision !== 'pending') return { id, ok: false, error: 'Already decided.' }
  const ctx = await approvalContext(id)
  if (!ctx) return { id, ok: false, error: 'Application not found.' }
  if (ctx.blockers.length) return { id, ok: false, error: ctx.blockers.join('; ') }
  // Real customers draw on the routed funder; test customers only ever on a test funder.
  const option =
    ctx.options.find((o) => o.funder.id === row.funder_id) ?? (row.is_test ? ctx.options[0] : null)
  if (!option)
    return {
      id,
      ok: false,
      error: 'SPEWA cannot carry this plan (balance, length or amount limits).',
    }
  const now = new Date().toISOString()
  // Claim the file first: only one decision can win.
  const { data: claimed } = await admin
    .from('funder_queue')
    .update({ decision: 'approved', decided_by: actor.id, decided_at: now })
    .eq('application_id', id)
    .eq('decision', 'pending')
    .select('application_id')
  if (!claimed?.length) return { id, ok: false, error: 'Already decided.' }
  const res = await approveApplication({
    applicationId: id,
    funderId: option.funder.id,
    actor,
    via: 'funder_queue',
  })
  if (!res.ok) {
    await admin
      .from('funder_queue')
      .update({ decision: 'pending', decided_by: null, decided_at: null })
      .eq('application_id', id)
    return { id, ok: false, error: [res.error, ...(res.blockers ?? [])].join(' ') }
  }
  await audit(actor, 'funder_queue.approve', id, {
    funderId: option.funder.id,
    funderName: option.funder.name,
    decidedAt: now,
  })
  return { id, ok: true }
}

async function declineOne(id: string, reason: string, actor: Actor): Promise<DecisionResult> {
  const now = new Date().toISOString()
  const { data } = await createAdminClient()
    .from('funder_queue')
    .update({
      decision: 'declined',
      decided_by: actor.id,
      decided_at: now,
      decision_reason: reason,
    })
    .eq('application_id', id)
    .eq('decision', 'pending')
    .select('application_id')
  if (!data?.length) {
    const row = await queueRowFor(id)
    return {
      id,
      ok: false,
      error: row ? 'Already decided.' : 'This file is not in the SPEWA queue.',
    }
  }
  await audit(actor, 'funder_queue.decline', id, { reason, decidedAt: now })
  return { id, ok: true }
}

/** The post-dated cheques note, entered by our staff (cheques arrive by hand). */
export async function recordCheques(
  applicationId: string,
  input: unknown,
  actor: Actor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canRecordCheques(actor.role))
    return { ok: false, error: 'Only a credit officer or super admin can record cheques.' }
  const parsed = chequesSchema(lagosDate()).safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message }
  const c = parsed.data
  const { data } = await createAdminClient()
    .from('funder_queue')
    .update({
      cheques_received: c.received,
      cheques_count: c.count,
      cheques_received_on: c.receivedOn,
      cheques_updated_by: actor.id,
      cheques_updated_at: new Date().toISOString(),
    })
    .eq('application_id', applicationId)
    .select('application_id')
  if (!data?.length) return { ok: false, error: 'This file is not in the SPEWA queue.' }
  await audit(actor, 'funder_queue.cheques', applicationId, c)
  return { ok: true }
}

// ------------------------------------------------------------ reading the queue

export type Cheques = { received: boolean | null; count: number | null; receivedOn: string | null }

export type FunderQueueItem = {
  id: string
  name: string
  state: string | null
  reference: string | null
  systemPrice: number | null
  depositShare: number
  routedAt: string
  decision: QueueDecision
  decidedBy: string | null
  decidedAt: string | null
  reason: string | null
  cheques: Cheques
  appStatus: string
  loanStatus: string | null
  repayment: RepaymentSummary | null
  isTest: boolean
}

type Personal = { state?: string }

/** The SPEWA queue: every routed file, newest first, with its decision and repayments. */
export async function funderQueueList(opts: {
  decision?: QueueDecision
  includeTest: boolean
}): Promise<FunderQueueItem[]> {
  const admin = createAdminClient()
  let q = admin.from('funder_queue').select('*').order('routed_at', { ascending: false }).limit(500)
  if (opts.decision) q = q.eq('decision', opts.decision)
  const { data: rows } = await q
  const list = (rows ?? []).filter((r) => opts.includeTest || !r.is_test)
  if (!list.length) return []
  const ids = list.map((r) => r.application_id)
  const [apps, loans] = await Promise.all([
    admin
      .from('applications')
      .select('id, applicant_type, personal, business, quote_id, status')
      .in('id', ids),
    admin.from('loans').select('id, application_id, status').in('application_id', ids),
  ])
  const quoteIds = (apps.data ?? []).map((a) => a.quote_id).filter((x): x is string => Boolean(x))
  const loanIds = (loans.data ?? []).map((l) => l.id)
  const deciders = [
    ...new Set(list.map((r) => r.decided_by).filter((x): x is string => Boolean(x))),
  ]
  const [quotes, schedule, people] = await Promise.all([
    quoteIds.length ? admin.from('quotes').select('id, result').in('id', quoteIds) : { data: [] },
    loanIds.length
      ? admin
          .from('repayment_schedule')
          .select('loan_id, due_date, amount, paid_amount')
          .in('loan_id', loanIds)
      : { data: [] },
    deciders.length
      ? admin.from('profiles').select('id, full_name, email').in('id', deciders)
      : { data: [] },
  ])
  const appOf = new Map((apps.data ?? []).map((a) => [a.id, a]))
  const loanOf = new Map((loans.data ?? []).map((l) => [l.application_id, l]))
  const priceOf = new Map(
    (quotes.data ?? []).map((q) => [q.id, (q.result as unknown as QuoteResult).systemPrice]),
  )
  const who = new Map((people.data ?? []).map((p) => [p.id, p.full_name ?? p.email ?? 'Staff']))
  const today = lagosDate()
  return list.flatMap((r): FunderQueueItem[] => {
    const a = appOf.get(r.application_id)
    if (!a) return []
    const loan = loanOf.get(r.application_id) ?? null
    const rows = (schedule.data ?? []).filter((s) => loan && s.loan_id === loan.id)
    const repaying = loan && (loan.status === 'active' || loan.status === 'completed')
    return [
      {
        id: r.application_id,
        name: applicantName(a),
        state: ((a.personal ?? {}) as Personal).state ?? null,
        reference: a.quote_id ? quoteReference(a.quote_id) : null,
        systemPrice: a.quote_id ? (priceOf.get(a.quote_id) ?? null) : null,
        depositShare: Number(r.deposit_share),
        routedAt: r.routed_at,
        decision: r.decision as QueueDecision,
        decidedBy: r.decided_by ? (who.get(r.decided_by) ?? 'Staff') : null,
        decidedAt: r.decided_at,
        reason: r.decision_reason,
        cheques: {
          received: r.cheques_received,
          count: r.cheques_count,
          receivedOn: r.cheques_received_on,
        },
        appStatus: a.status,
        loanStatus: loan?.status ?? null,
        repayment: repaying
          ? repaymentSummary(
              rows.map((s) => ({
                dueDate: s.due_date,
                amount: Number(s.amount),
                paidAmount: Number(s.paid_amount),
              })),
              today,
            )
          : null,
        isTest: r.is_test,
      },
    ]
  })
}
