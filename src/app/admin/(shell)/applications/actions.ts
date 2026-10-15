'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { createAssistedApplication, sendCustomerLink } from '@/lib/assisted/server'
import {
  approveApplication,
  declineApplication,
  requestMoreInfo,
  reviewKycCheck,
} from '@/lib/approvals/server'
import { siteOrigin } from '@/lib/auth/emailVerification'
import { approveExtension } from '@/lib/payments/extension'
import { staffActor } from '@/lib/auth/staffActor'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string; blockers?: string[] }
const SIGN_IN = { ok: false, error: 'Please sign in with two-factor first.' } as const

function refresh(id: string) {
  revalidatePath(`/admin/applications/${id}`)
  revalidatePath('/admin/applications')
  revalidatePath('/admin')
}

export async function approve(applicationId: string, funderId: string): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await approveApplication({ applicationId, funderId, actor })
  refresh(applicationId)
  return r
}

export async function decline(applicationId: string, reason: string): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await declineApplication({ applicationId, reason, actor })
  refresh(applicationId)
  return r
}

export async function askForMoreInfo(applicationId: string, message: string): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await requestMoreInfo({ applicationId, message, actor })
  refresh(applicationId)
  return r
}

export async function reviewCheck(
  applicationId: string,
  checkId: string,
  outcome: 'clear' | 'fail',
  reason: string,
): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await reviewKycCheck({ checkId, outcome, reason, actor })
  refresh(applicationId)
  return r
}

/** assisted_entry permission (any role) or super admin. */
async function canAssist(role: string | null) {
  if (role === 'super_admin') return true
  const supabase = await createClient()
  const { data } = await supabase.rpc('has_permission', { target: 'assisted_entry' })
  return data === true
}

export async function newAssistedApplication(
  input: unknown,
): Promise<{ ok: true; applicationId: string } | { ok: false; error: string }> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  if (!(await canAssist(actor.role)))
    return { ok: false, error: 'You do not have the assisted-entry permission.' }
  const r = await createAssistedApplication({
    ...(input as object),
    actorId: actor.id,
    origin: siteOrigin(await headers()),
  } as Parameters<typeof createAssistedApplication>[0])
  revalidatePath('/admin/applications')
  return r
}

export async function resendCustomerLink(applicationId: string): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  if (!(await canAssist(actor.role)))
    return { ok: false, error: 'You do not have the assisted-entry permission.' }
  return sendCustomerLink({ applicationId, actorId: actor.id, origin: siteOrigin(await headers()) })
}

export async function approvePlanExtension(
  applicationId: string,
  loanId: string,
  until: string,
): Promise<Result> {
  const actor = await staffActor()
  if (!actor) return SIGN_IN
  const r = await approveExtension({ loanId, until, actor })
  refresh(applicationId)
  return r
}
