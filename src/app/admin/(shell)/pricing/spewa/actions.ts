'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo, type SessionInfo } from '@/lib/auth/session'
import { itemToRow, offerTermsForm, spewaItemSchema } from '@/lib/spewa/adminSchemas'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

type Result = { ok: true; id?: string } | { ok: false; error: string; field?: string }

async function superAdmin(): Promise<SessionInfo | null> {
  const s = await getSessionInfo()
  return s.user && s.role === 'super_admin' && s.aal === 'aal2' ? s : null
}
const DENIED: Result = { ok: false, error: 'Only a super admin can change the SPEWA price list.' }

async function audit(
  s: SessionInfo,
  action: string,
  entity: string,
  id: string | null,
  before: unknown,
  after: unknown,
) {
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: s.user!.id,
      action,
      entity,
      entity_id: id,
      before: (before ?? null) as Json,
      after: (after ?? null) as Json,
    })
}

/** Business quotes read the price list and terms on the next request; the pages show them. */
function refresh() {
  revalidatePath('/admin/pricing/spewa')
  revalidatePath('/build')
  revalidatePath('/admin/quotations/new')
}

/** Add or change one item (audited). */
export async function saveSpewaItem(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const p = spewaItemSchema.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the item.', field: issue?.path.join('.') }
  }
  const admin = createAdminClient()
  const row = itemToRow(p.data)
  const before = p.data.id
    ? (await admin.from('spewa_price_items').select('*').eq('id', p.data.id).maybeSingle()).data
    : null
  if (p.data.id && !before) return { ok: false, error: 'This item no longer exists.' }
  const { data, error } = before
    ? await admin.from('spewa_price_items').update(row).eq('id', before.id).select('id').single()
    : await admin.from('spewa_price_items').insert(row).select('id').single()
  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? `Another item already has the code ${row.code}.`
          : 'Could not save the item. Please try again.',
      field: error.code === '23505' ? 'code' : undefined,
    }
  }
  await audit(
    session,
    before ? 'spewa_item.update' : 'spewa_item.create',
    'spewa_price_items',
    data.id,
    before,
    row,
  )
  refresh()
  return { ok: true, id: data.id }
}

/** Switch an item on or off (audited). */
export async function setSpewaItemActive(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const p = z.object({ id: z.string().uuid(), active: z.boolean() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Check the request.' }
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('spewa_price_items')
    .select('id, code, active')
    .eq('id', p.data.id)
    .maybeSingle()
  if (!before) return { ok: false, error: 'This item no longer exists.' }
  const { error } = await admin
    .from('spewa_price_items')
    .update({ active: p.data.active })
    .eq('id', p.data.id)
  if (error) return { ok: false, error: 'Could not change the item. Please try again.' }
  await audit(
    session,
    p.data.active ? 'spewa_item.on' : 'spewa_item.off',
    'spewa_price_items',
    p.data.id,
    before,
    { ...before, active: p.data.active },
  )
  refresh()
  return { ok: true }
}

/** Remove an item from the list (audited with the whole old row). Old quotes keep their copy. */
export async function deleteSpewaItem(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const p = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Check the request.' }
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('spewa_price_items')
    .select('*')
    .eq('id', p.data.id)
    .maybeSingle()
  if (!before) return { ok: false, error: 'This item no longer exists.' }
  const { error } = await admin.from('spewa_price_items').delete().eq('id', p.data.id)
  if (error) return { ok: false, error: 'Could not remove the item. Please try again.' }
  await audit(session, 'spewa_item.delete', 'spewa_price_items', p.data.id, before, null)
  refresh()
  return { ok: true }
}

/**
 * The offer terms (audited): which column is the partner price and which the selling price,
 * the price list date, quote validity, the charge per length, bad-debt provision and the split.
 */
export async function saveSpewaTerms(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const p = offerTermsForm.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the terms.', field: issue?.path.join('.') }
  }
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'spewa_offer')
    .maybeSingle()
  const { error } = await admin
    .from('settings')
    .upsert({
      key: 'spewa_offer',
      value: p.data as unknown as Json,
      updated_by: session.user!.id,
      updated_at: new Date().toISOString(),
    })
  if (error) return { ok: false, error: 'Could not save the terms. Please try again.' }
  await audit(session, 'spewa_offer.update', 'settings.spewa_offer', null, before?.value ?? null, p.data)
  refresh()
  return { ok: true }
}
