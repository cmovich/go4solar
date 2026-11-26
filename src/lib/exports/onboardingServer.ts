import 'server-only'

import { canEditLeadProfile, isFunderLogin } from '@/lib/auth/staffRoles'
import { getMessagingProvider } from '@/lib/providers/messaging'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { funderIdFor, type Actor } from '@/lib/tradeLenda/server'

import { onboardingLinkProblem, onboardingWhatsappHref } from './onboarding'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

async function audit(actor: Actor, action: string, entity: string, id: string, after: unknown) {
  await createAdminClient()
    .from('audit_log')
    .insert({ actor_id: actor.id, action, entity, entity_id: id, after: after as Json })
}

/**
 * The funder adds (or clears) an onboarding link: one person (itemId) or the whole batch. Only the
 * funder's own login (or a super admin viewing as that funder); https on its own domains only.
 */
export async function setOnboardingLink(
  input: { batchId: string; itemId: string | null; url: string; viewAs?: string | null },
  actor: Actor,
): Promise<Result> {
  if (!isFunderLogin(actor.role) && actor.role !== 'super_admin')
    return { ok: false, error: 'Only the funder adds onboarding links.' }
  const admin = createAdminClient()
  const funderId = await funderIdFor(actor, input.viewAs)
  const { data: batch } = await admin
    .from('funder_batches')
    .select('id, funder_id, replaced_by, voided_at, funders(onboarding_domains)')
    .eq('id', input.batchId)
    .maybeSingle()
  if (!batch || batch.funder_id !== funderId || batch.voided_at)
    return { ok: false, error: 'Batch not found.' }
  const url = input.url.trim()
  if (url) {
    const domains = ((batch.funders as { onboarding_domains: string[] } | null)
      ?.onboarding_domains ?? []) as string[]
    const problem = onboardingLinkProblem(url, domains)
    if (problem) return { ok: false, error: problem }
  }
  const now = new Date().toISOString()
  if (input.itemId) {
    const { data: done, error } = await admin
      .from('funder_batch_items')
      .update({
        onboarding_url: url || null,
        onboarding_set_at: url ? now : null,
        onboarding_set_by: url ? actor.id : null,
      })
      .eq('id', input.itemId)
      .eq('batch_id', batch.id)
      .select('id')
    if (error || !done?.length) return { ok: false, error: 'Could not save the link.' }
  } else {
    const { error } = await admin
      .from('funder_batches')
      .update({ onboarding_url: url || null })
      .eq('id', batch.id)
    if (error) return { ok: false, error: 'Could not save the link.' }
  }
  await audit(
    actor,
    url ? 'onboarding_link.set' : 'onboarding_link.clear',
    'funder_batches',
    batch.id,
    {
      item: input.itemId,
      url: url || null,
    },
  )
  return { ok: true }
}

export type OnboardingLinkRow = {
  itemId: string
  funderName: string
  batch: string
  url: string
  /** Whose link: this person's own, or the whole batch's. */
  scope: 'person' | 'batch'
  sends: { channel: 'whatsapp' | 'email'; at: string; by: string }[]
}

/** Our side (the person's Edit page): every onboarding link a funder gave for this person. */
export async function onboardingLinksFor(waitlistId: string): Promise<OnboardingLinkRow[]> {
  const admin = createAdminClient()
  const { data: items } = await admin
    .from('funder_batch_items')
    .select(
      'id, onboarding_url, funder_batches(number, version, onboarding_url, replaced_by, voided_at, funders(name))',
    )
    .eq('waitlist_id', waitlistId)
  const rows = (items ?? []).flatMap((i) => {
    const b = i.funder_batches as {
      number: string
      version: number
      onboarding_url: string | null
      replaced_by: string | null
      voided_at: string | null
      funders: { name: string } | null
    } | null
    const url = i.onboarding_url ?? b?.onboarding_url ?? null
    if (!b || b.replaced_by || b.voided_at || !url) return []
    return [
      {
        itemId: i.id,
        funderName: b.funders?.name ?? 'Funder',
        batch: `${b.number}${b.version > 1 ? ` v${b.version}` : ''}`,
        url,
        scope: (i.onboarding_url ? 'person' : 'batch') as 'person' | 'batch',
      },
    ]
  })
  if (rows.length === 0) return []
  const { data: sends } = await admin
    .from('onboarding_link_sends')
    .select('batch_item_id, channel, sent_at, sent_by')
    .in(
      'batch_item_id',
      rows.map((r) => r.itemId),
    )
    .order('sent_at')
  const people = [...new Set((sends ?? []).map((x) => x.sent_by))]
  const { data: who } = people.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', people)
    : { data: [] }
  const name = new Map((who ?? []).map((p) => [p.id, p.full_name ?? p.email ?? 'Staff']))
  return rows.map((r) => ({
    ...r,
    sends: (sends ?? [])
      .filter((x) => x.batch_item_id === r.itemId)
      .map((x) => ({
        channel: x.channel === 'email' ? ('email' as const) : ('whatsapp' as const),
        at: x.sent_at,
        by: name.get(x.sent_by) ?? 'Staff',
      })),
  }))
}

/**
 * "Send by WhatsApp" (returns the wa.me link to open) or "Send by email" (our outbox), recording
 * who sent which link, how and when.
 */
export async function sendOnboardingLink(
  input: { itemId: string; channel: 'whatsapp' | 'email' },
  actor: Actor,
): Promise<Result<{ href?: string }>> {
  if (!canEditLeadProfile(actor.role)) return { ok: false, error: 'You cannot send links.' }
  const admin = createAdminClient()
  const { data: item } = await admin
    .from('funder_batch_items')
    .select('id, waitlist_id, onboarding_url, funder_batches(onboarding_url, funders(name))')
    .eq('id', input.itemId)
    .maybeSingle()
  const b = item?.funder_batches as {
    onboarding_url: string | null
    funders: { name: string } | null
  } | null
  const url = item?.onboarding_url ?? b?.onboarding_url ?? null
  if (!item || !url) return { ok: false, error: 'There is no onboarding link to send.' }
  const { data: lead } = await admin
    .from('waitlist_consumers')
    .select('first_name, phone_e164, whatsapp_e164, email, is_test')
    .eq('id', item.waitlist_id)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Entry not found.' }
  const funderName = b?.funders?.name ?? 'the funder'
  let href: string | undefined
  if (input.channel === 'email') {
    if (!lead.email) return { ok: false, error: 'This customer has no email address.' }
    const sent = await (
      await getMessagingProvider()
    ).send({
      channel: 'email',
      to: lead.email,
      template: 'onboarding_link',
      payload: {
        subject: `Next step for your solar payment plan with ${funderName}`,
        text: `${lead.first_name ? `Hello ${lead.first_name}` : 'Hello'}, this is Go4Solar. To continue your solar payment plan, please complete your details and verification with ${funderName} here: ${url}`,
      },
    })
    if (sent.status === 'failed') return { ok: false, error: 'The email could not be sent.' }
  } else {
    href = onboardingWhatsappHref({
      phone: lead.whatsapp_e164 ?? lead.phone_e164,
      firstName: lead.first_name,
      funderName,
      url,
    })
  }
  await admin.from('onboarding_link_sends').insert({
    batch_item_id: item.id,
    channel: input.channel,
    url,
    sent_by: actor.id,
    is_test: lead.is_test,
  })
  await audit(actor, `onboarding_link.send_${input.channel}`, 'funder_batch_items', item.id, {
    url,
  })
  return { ok: true, ...(href ? { href } : {}) }
}
