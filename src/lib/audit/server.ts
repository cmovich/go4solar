import 'server-only'

import { createClient } from '@/lib/supabase/server'

import type { AuditFilters, AuditRow } from './view'

export const AUDIT_PAGE_LIMIT = 500
export const AUDIT_EXPORT_LIMIT = 20000

export type AuditEntry = AuditRow & { id: string; actor_id: string | null }

/** Tables and app areas that appear in the log, for the filter list. */
export const AUDIT_TABLES = [
  'agreement_templates',
  'agreements',
  'appliance_library',
  'applications',
  'auth.sessions',
  'cash_referrals',
  'category_margins',
  'components',
  'documents',
  'forecast_scenarios',
  'funder_draws',
  'funders',
  'guarantees',
  'installation_costs',
  'jobs',
  'kyc_checks',
  'loans',
  'mandates',
  'overheads',
  'partners',
  'payments',
  'pricing_rates',
  'profiles',
  'quotes',
  'reminders',
  'repayment_schedule',
  'settings',
  'staff_permissions',
  'testimonials',
  'unit_costs',
  'waitlist_consumers',
  'waitlist_exports',
  'waitlist_installers',
] as const

/**
 * Audit entries matching the filters, newest first, read as the signed-in super admin (RLS).
 * Before migration 0020 the actor email/role/source columns do not exist: fall back to the rest.
 */
export async function auditEntries(f: AuditFilters, limit: number): Promise<AuditEntry[]> {
  const supabase = await createClient()
  const run = async (columns: string) => {
    let q = supabase
      .from('audit_log')
      .select(columns)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (f.who) q = q.eq('actor_id', f.who)
    if (f.fromIso) q = q.gte('created_at', f.fromIso)
    if (f.toIso) q = q.lte('created_at', f.toIso)
    if (f.table) q = q.eq('entity', f.table)
    if (f.action) q = q.like('action', `${f.action}%`)
    return q
  }
  const base = 'id, created_at, actor_id, action, entity, entity_id, before, after'
  let res = await run(`${base}, actor_email, actor_role, source`)
  if (res.error) res = await run(base)
  if (res.error) throw new Error(res.error.message)
  const rows = res.data as unknown as Partial<AuditEntry>[]
  // Older entries have no email/role copied in: look the people up.
  const missing = [
    ...new Set(rows.filter((r) => r.actor_id && !r.actor_email).map((r) => r.actor_id!)),
  ]
  const people = missing.length
    ? ((await supabase.from('profiles').select('id, email, role').in('id', missing)).data ?? [])
    : []
  const byId = new Map(people.map((p) => [p.id, p]))
  return rows.map((r) => ({
    id: r.id!,
    created_at: r.created_at!,
    actor_id: r.actor_id ?? null,
    actor_email: r.actor_email ?? (r.actor_id ? (byId.get(r.actor_id)?.email ?? null) : null),
    actor_role: r.actor_role ?? (r.actor_id ? (byId.get(r.actor_id)?.role ?? null) : null),
    action: r.action!,
    entity: r.entity!,
    entity_id: r.entity_id ?? null,
    source: r.source ?? 'app',
    before: r.before ?? null,
    after: r.after ?? null,
  }))
}
