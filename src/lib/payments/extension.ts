import 'server-only'

import type { Actor } from '@/lib/approvals/server'
import { contactFromPersonal, notifyCustomer } from '@/lib/notify/customer'
import { createAdminClient } from '@/lib/supabase/admin'

import { extensionProblem, lagosDate } from './lock'

type Result = { ok: true } | { ok: false; error: string }

/** Who may approve an extension: the people who handle late payments and decisions. */
const APPROVERS = ['super_admin', 'credit_officer', 'collections']

const day = (iso: string) =>
  new Date(`${iso}T12:00:00+01:00`).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'long',
  })

/**
 * Approve the plan's one extension: the remote lock is paused until `until` (inclusive).
 * Written once (conditional update), audited, and the customer is told.
 */
export async function approveExtension(input: {
  loanId: string
  until: string
  actor: Actor
  today?: string
}): Promise<Result> {
  const { actor } = input
  if (!actor.role || !APPROVERS.includes(actor.role))
    return { ok: false, error: 'Only collections, a credit officer or a super admin can do this.' }
  const today = input.today ?? lagosDate()
  const admin = createAdminClient()
  const { data: loan } = await admin
    .from('loans')
    .select('id, status, application_id, extension_until')
    .eq('id', input.loanId)
    .maybeSingle()
  if (!loan) return { ok: false, error: 'Plan not found.' }
  const problem = extensionProblem({
    until: input.until,
    today,
    alreadyGranted: loan.extension_until !== null,
    active: loan.status === 'active',
  })
  if (problem) return { ok: false, error: problem }

  const { data: won } = await admin
    .from('loans')
    .update({
      extension_until: input.until,
      extension_approved_by: actor.id,
      extension_approved_at: new Date().toISOString(),
    })
    .eq('id', loan.id)
    .is('extension_until', null)
    .select('id')
  if (!won?.length) return { ok: false, error: 'This plan has already had its one extension.' }

  await admin.from('audit_log').insert({
    actor_id: actor.id,
    action: 'loan.extension.approve',
    entity: 'loans',
    entity_id: loan.id,
    before: { extension_until: null },
    after: { extension_until: input.until },
  })
  const { data: app } = await admin
    .from('applications')
    .select('personal')
    .eq('id', loan.application_id)
    .maybeSingle()
  const c = contactFromPersonal(app?.personal)
  await notifyCustomer(c, 'extension_approved', {
    subject: 'Your payment extension is approved',
    text: `Hi ${c.firstName}, your extension is approved until ${day(input.until)}. Your system will not be locked before then. Please pay the overdue amount by that date.`,
  })
  return { ok: true }
}
