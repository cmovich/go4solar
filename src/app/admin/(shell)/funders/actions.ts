'use server'

import { revalidatePath } from 'next/cache'

import { getSessionInfo } from '@/lib/auth/session'
import { routingRuleSchema } from '@/lib/funderQueue/routingRules'
import { funderSchema } from '@/lib/pricing/adminSchemas'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true; id: string } | { ok: false; error: string; field?: string }

/** Add or edit a funder (super_admin). Pausing is an edit with status 'paused'. */
export async function saveFunder(input: unknown): Promise<Result> {
  const session = await getSessionInfo()
  if (!session.user || session.role !== 'super_admin' || session.aal !== 'aal2') {
    return { ok: false, error: 'Only a super admin can change funders.' }
  }
  const parsed = funderSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the values', field: issue?.path.join('.') }
  }
  const d = parsed.data
  const supabase = await createClient()
  const { data: before } = d.id
    ? await supabase.from('funders').select('*').eq('id', d.id).maybeSingle()
    : { data: null }

  const row = {
    ...(d.id ? { id: d.id } : {}),
    name: d.name,
    kind: d.kind,
    annual_rate: d.annualRate,
    method: d.method,
    upfront_fee_share: d.upfrontFeeShare,
    min_amount: d.minAmount,
    max_amount: d.maxAmount,
    max_tenure: d.maxTenure,
    balance_available: d.balanceAvailable,
    status: d.status,
    lending_types: d.lendingTypes,
    default_lending_type: d.defaultLendingType,
    contact_email: d.contactEmail ?? null,
    sample: false,
  }
  const { data, error } = await supabase.from('funders').upsert(row).select('id').single()
  if (error) return { ok: false, error: error.message }

  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: session.user.id,
      action: d.id ? 'funders.update' : 'funders.create',
      entity: 'funders',
      entity_id: data.id,
      before: (before ?? null) as unknown as Json,
      after: row as unknown as Json,
    })
  revalidatePath('/admin/funders')
  revalidatePath('/admin/pricing')
  return { ok: true, id: data.id }
}

/**
 * Add or change a routing rule (super_admin, audited): funder, customer type, minimum deposit,
 * lengths, offer, default, active. Rules are switched off, never deleted.
 */
export async function saveRoutingRule(input: unknown): Promise<Result> {
  const session = await getSessionInfo()
  if (!session.user || session.role !== 'super_admin' || session.aal !== 'aal2') {
    return { ok: false, error: 'Only a super admin can change routing rules.' }
  }
  const parsed = routingRuleSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the rule', field: issue?.path.join('.') }
  }
  const d = parsed.data
  const admin = createAdminClient()
  const { data: before } = d.id
    ? await admin.from('funder_routing_rules').select('*').eq('id', d.id).maybeSingle()
    : { data: null }
  if (d.id && !before) return { ok: false, error: 'This rule no longer exists.' }
  const row = {
    funder_id: d.funderId,
    applicant_type: d.applicantType,
    min_deposit_share: d.minDepositShare,
    tenures: d.tenures,
    offer: d.offer,
    is_default: d.isDefault,
    active: d.active,
    sort_order: d.sortOrder,
  }
  const { data, error } = before
    ? await admin.from('funder_routing_rules').update(row).eq('id', before.id).select('id').single()
    : await admin.from('funder_routing_rules').insert(row).select('id').single()
  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'Another active rule is already the default for this customer type. Switch it off or untick its default first.'
          : 'Could not save the rule. Please try again.',
    }
  }
  await admin.from('audit_log').insert({
    actor_id: session.user.id,
    action: before ? 'routing_rule.update' : 'routing_rule.create',
    entity: 'funder_routing_rules',
    entity_id: data.id,
    before: (before ?? null) as unknown as Json,
    after: row as unknown as Json,
  })
  revalidatePath('/admin/funders')
  revalidatePath('/build')
  return { ok: true, id: data.id }
}
