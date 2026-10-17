import 'server-only'

import { randomBytes } from 'node:crypto'

import { z } from 'zod'

import { ensureApplication } from '@/lib/applications/server'
import { contactFromPersonal, notifyCustomer } from '@/lib/notify/customer'
import { loadLeadForStaff } from '@/lib/quotes/leadForPlans'
import { priceVariant, validUntil } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { ENTRY_CHANNELS } from '@/lib/waitlist/schema'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export const assistedSchema = z.object({
  leadId: z.uuid('Pick the customer from the waiting list'),
  plan: z.enum(['essential', 'comfort', 'independence']),
  tenure: z.union([
    z.literal(3),
    z.literal(6),
    z.literal(9),
    z.literal(12),
    z.literal(18),
    z.literal(24),
  ]),
  depositShare: z.number().min(0.2).max(0.95),
  email: z.email("Enter the customer's email address"),
  channel: z.enum(ENTRY_CHANNELS),
})

async function audit(actorId: string, action: string, id: string, after: unknown) {
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: actorId,
      action,
      entity: 'applications',
      entity_id: id,
      before: null,
      after: after as Json,
    })
}

/**
 * "New application on behalf of customer" (assisted_entry permission, checked by the caller).
 * Staff pick the customer's lead (with their load and details), the plan, tenure and deposit;
 * this creates the customer's own account, the quote and the application (Entered by staff),
 * then sends the customer a secure link to finish the identity steps on their own phone.
 */
export async function createAssistedApplication(
  input: z.input<typeof assistedSchema> & { actorId: string; origin: string },
): Promise<Result<{ applicationId: string }>> {
  const p = assistedSchema.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Check the details.' }
  const ctx = await loadLeadForStaff(p.data.leadId)
  if (!ctx)
    return { ok: false, error: 'That customer record has no load or plan yet. Complete it first.' }
  if (!ctx.tenures.includes(p.data.tenure)) {
    return {
      ok: false,
      error: `${p.data.tenure} months is not offered for this customer's estimate. Choose another length.`,
    }
  }
  const lead = ctx.lead
  const admin = createAdminClient()

  const fullName = [lead.first_name, lead.surname].filter(Boolean).join(' ')
  const { data: created, error } = await admin.auth.admin.createUser({
    email: p.data.email,
    // Never shown or sent: the customer signs in with the secure link (and can set a password later).
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    user_metadata: { full_name: fullName, phone_e164: lead.phone_e164, assisted: true },
  })
  if (error || !created.user) {
    return /already|registered|exists/i.test(error?.message ?? '')
      ? {
          ok: false,
          error:
            'That email already has an account. Ask the customer to sign in and apply themselves.',
        }
      : { ok: false, error: 'Could not create the customer account.' }
  }
  const userId = created.user.id
  await admin
    .from('profiles')
    .update({ full_name: fullName || null, phone_e164: lead.phone_e164, state: lead.state })
    .eq('id', userId)

  const v = priceVariant(ctx.estimate, p.data.plan, p.data.tenure, p.data.depositShare, ctx.tenures)
  const { error: quoteError } = await admin.from('quotes').insert({
    owner_id: userId,
    waitlist_id: lead.id,
    anon_token_hash: `assisted:${randomBytes(16).toString('hex')}`,
    state: ctx.state,
    applicant_type: lead.applicant_type,
    load_items: lead.load_items,
    load_totals: lead.load_totals,
    energy: lead.energy,
    plan: p.data.plan,
    system_size: ctx.estimate.plans[p.data.plan].size as unknown as Json,
    tenure: p.data.tenure,
    deposit_share: p.data.depositShare,
    result: v.quote as unknown as Json,
    valid_until: validUntil(new Date(), ctx.validityDays).toISOString(),
    status: 'chosen',
  })
  if (quoteError) return { ok: false, error: 'Could not save the plan.' }
  if (!lead.email)
    await admin.from('waitlist_consumers').update({ email: p.data.email }).eq('id', lead.id)

  const app = await ensureApplication(userId)
  if (!app) return { ok: false, error: 'Could not create the application.' }
  await admin
    .from('applications')
    .update({
      entered_by: input.actorId,
      entry_channel: p.data.channel,
      personal: { ...((app.personal ?? {}) as object), email: p.data.email } as Json,
    })
    .eq('id', app.id)
  await audit(input.actorId, 'application.assisted_create', app.id, {
    channel: p.data.channel,
    plan: p.data.plan,
    tenure: p.data.tenure,
    depositShare: p.data.depositShare,
  })
  const sent = await sendCustomerLink({
    applicationId: app.id,
    actorId: input.actorId,
    origin: input.origin,
  })
  if (!sent.ok) return sent
  return { ok: true, applicationId: app.id }
}

/**
 * A one-time sign-in link (Supabase magic link, verified on our /auth/confirm) by SMS, WhatsApp and
 * email, so the customer finishes NIN/BVN, consent, face check, signature, deposit and auto-pay on
 * their own phone. A new link replaces the old one.
 */
export async function sendCustomerLink(input: {
  applicationId: string
  actorId: string
  origin: string
}): Promise<Result> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('id, consumer_id, personal, status, entered_by')
    .eq('id', input.applicationId)
    .maybeSingle()
  if (!app?.entered_by) return { ok: false, error: 'Not an assisted application.' }
  if (app.status !== 'draft') return { ok: false, error: 'The customer has already finished.' }
  const { data: user } = await admin.auth.admin.getUserById(app.consumer_id)
  const email = user.user?.email
  if (!email) return { ok: false, error: 'The customer has no email address.' }
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const hashed = data?.properties?.hashed_token
  if (error || !hashed) return { ok: false, error: 'Could not create the link.' }
  const link = `${input.origin}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=magiclink&next=/app/apply`
  const c = contactFromPersonal(app.personal)
  await notifyCustomer({ phone: c.phone, email }, 'assisted_link', {
    subject: 'Finish your Go4Solar application',
    text:
      `Hi ${c.firstName}, Go4Solar has started your solar payment plan application. ` +
      `Please check your details and finish the last steps on your phone (it takes about 10 minutes): ${link} ` +
      'The link works once and expires soon; ask us for a new one if needed.',
  })
  await audit(input.actorId, 'application.assisted_link', app.id, { to: c.phone ?? email })
  return { ok: true }
}
