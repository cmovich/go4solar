import 'server-only'

import { z } from 'zod'

import { sendEmailVerification } from '@/lib/auth/emailVerification'
import { notifyCustomer } from '@/lib/notify/customer'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import type { createClient } from '@/lib/supabase/server'

import {
  CHANGE_FIELD_LABELS,
  changeRequestSchema,
  formatAddress,
  type ChangeField,
} from './account'

type Result = { ok: true } | { ok: false; error: string }
type Client = Awaited<ReturnType<typeof createClient>>

/** The customer's current value of a detail (shown to staff next to the new one). */
async function currentValue(userId: string, field: ChangeField): Promise<string | null> {
  const admin = createAdminClient()
  if (field === 'address') {
    const { data } = await admin
      .from('applications')
      .select('install_address')
      .eq('consumer_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return formatAddress(data?.install_address as Parameters<typeof formatAddress>[0])
  }
  const { data } = await admin
    .from('profiles')
    .select('full_name, phone_e164, email')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return null
  return field === 'name' ? data.full_name : field === 'phone' ? data.phone_e164 : data.email
}

/**
 * "Request a change": a pending request (the customer's own session writes it, RLS checks it).
 * Verified details only change when staff approve.
 */
export async function requestChange(
  client: Client,
  userId: string,
  input: unknown,
): Promise<Result> {
  const parsed = changeRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the new value' }
  }
  const d = parsed.data
  const { error } = await client.from('change_requests').insert({
    consumer_id: userId,
    field: d.field,
    current_value: await currentValue(userId, d.field),
    new_value: d.newValue,
    reason: d.reason || null,
    status: 'pending',
  })
  if (error) {
    return error.code === '23505'
      ? {
          ok: false,
          error: `You already asked to change your ${CHANGE_FIELD_LABELS[d.field].toLowerCase()}. We will reply soon.`,
        }
      : { ok: false, error: 'Could not send your request. Please try again.' }
  }
  return { ok: true }
}

export const decisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(300).optional(),
})

/**
 * Staff approve (the change is applied) or reject a pending request. Audited with before/after;
 * the customer is told. Callers check the staff role first.
 */
export async function decideChange(staffId: string, input: unknown, origin = ''): Promise<Result> {
  const parsed = decisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request.' }
  const { id, decision, note } = parsed.data
  const admin = createAdminClient()
  const { data: req } = await admin
    .from('change_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .maybeSingle()
  if (!req) return { ok: false, error: 'This request was already decided.' }
  const field = req.field as ChangeField

  if (decision === 'approve') {
    if (field === 'name') {
      await admin.from('profiles').update({ full_name: req.new_value }).eq('id', req.consumer_id)
    } else if (field === 'phone') {
      await admin.from('profiles').update({ phone_e164: req.new_value }).eq('id', req.consumer_id)
    } else if (field === 'email') {
      const { error } = await admin.auth.admin.updateUserById(req.consumer_id, {
        email: req.new_value,
        email_confirm: true,
      })
      if (error) return { ok: false, error: 'Could not change the login email.' }
      await admin
        .from('profiles')
        .update({ email: req.new_value, email_verified_at: null })
        .eq('id', req.consumer_id)
      // The new address is confirmed again through our own link.
      await sendEmailVerification(req.consumer_id, req.new_value, origin)
    } else {
      const { data: app } = await admin
        .from('applications')
        .select('id, install_address')
        .eq('consumer_id', req.consumer_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!app) return { ok: false, error: 'The customer has no application with an address.' }
      const prev = (app.install_address ?? {}) as Record<string, unknown>
      await admin
        .from('applications')
        .update({
          install_address: {
            line1: req.new_value,
            state: prev.state ?? null,
            changeRequest: id,
          } as Json,
        })
        .eq('id', app.id)
    }
  }

  await admin
    .from('change_requests')
    .update({
      status: decision === 'approve' ? 'approved' : 'rejected',
      decided_by: staffId,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq('id', id)
  await admin.from('audit_log').insert({
    actor_id: staffId,
    action: `change_request.${decision}`,
    entity: 'change_requests',
    entity_id: id,
    before: { [field]: req.current_value } as Json,
    after: (decision === 'approve'
      ? { [field]: req.new_value }
      : { [field]: req.current_value, rejected: req.new_value, note: note || null }) as Json,
  })

  const { data: who } = await admin
    .from('profiles')
    .select('phone_e164, email')
    .eq('id', req.consumer_id)
    .maybeSingle()
  const label = CHANGE_FIELD_LABELS[field].toLowerCase()
  await notifyCustomer(
    { phone: who?.phone_e164 ?? null, email: who?.email ?? null },
    `change_request_${decision === 'approve' ? 'approved' : 'rejected'}`,
    decision === 'approve'
      ? {
          subject: `Your ${label} has been updated`,
          text: `Go4Solar: we have updated your ${label} as you asked.`,
        }
      : {
          subject: `About your ${label} change`,
          text: `Go4Solar: we could not change your ${label}${note ? `: ${note}` : '.'} Call us if you have questions.`,
        },
  )
  return { ok: true }
}
