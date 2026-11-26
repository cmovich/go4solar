/**
 * Staging database for previews (Semako, 26 Nov 2026): previews must never use the live
 * database. A one-time copy of the settings and price tables (no customer data) from live into
 * staging. Pure rules here; the copying is `scripts/staging-copy-config.ts`.
 */

/** Copied in this order (a table only points at tables before it). */
export const CONFIG_TABLES = [
  'settings',
  'appliance_library',
  'components',
  'category_margins',
  'pricing_rates',
  'installation_costs',
  'unit_costs',
  'overheads',
  'sun_hours',
  'roof_types',
  'rack_prices',
  'logistics_costs',
  'accessory_rules',
  'spewa_price_items',
  'ready_plans',
  'agreement_templates',
  'partners',
  'funders',
  'funder_routing_rules',
] as const

/** Customer, staff and money records: never copied to staging. */
export const NEVER_COPY = [
  'profiles',
  'staff_permissions',
  'waitlist_consumers',
  'waitlist_installers',
  'waitlist_exports',
  'lead_profiles',
  'lead_funder_consents',
  'quotes',
  'staff_quotations',
  'invoices',
  'applications',
  'kyc_checks',
  'documents',
  'consents',
  'guarantees',
  'agreements',
  'signature_otps',
  'phone_otps',
  'email_verifications',
  'loans',
  'repayment_schedule',
  'mandates',
  'payments',
  'funder_draws',
  'funder_queue',
  'funder_users',
  'funder_batches',
  'funder_batch_items',
  'export_queues',
  'export_queue_items',
  'onboarding_link_sends',
  'jobs',
  'change_requests',
  'cash_referrals',
  'reminders',
  'outbox',
  'audit_log',
  'rate_limits',
  'forecast_scenarios',
  'loan_profit_snapshots',
  'vision_usage',
  'testimonials',
] as const

/** Each table's primary key (used to clear staging's own sample rows before the copy). */
export const PRIMARY_KEY: Record<(typeof CONFIG_TABLES)[number], string> = {
  settings: 'key',
  appliance_library: 'id',
  components: 'id',
  category_margins: 'category',
  pricing_rates: 'tenure_months',
  installation_costs: 'id',
  unit_costs: 'id',
  overheads: 'month',
  sun_hours: 'state',
  roof_types: 'id',
  rack_prices: 'material',
  logistics_costs: 'state',
  accessory_rules: 'id',
  spewa_price_items: 'id',
  ready_plans: 'id',
  agreement_templates: 'id',
  partners: 'id',
  funders: 'id',
  funder_routing_rules: 'id',
}

/** Columns the database works out itself (cannot be written). */
const GENERATED: Record<string, string[]> = { pricing_rates: ['pricing_rate'] }

/** Personal contact details inside a config table: blanked. */
const BLANK: Record<string, string[]> = { funders: ['contact_email'] }

export function supabaseRef(url: string): string | null {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url.trim())
  return m ? m[1]! : null
}

/** Why this target must not be written to (null = fine). */
export function targetProblem(sourceUrl: string, targetUrl: string): string | null {
  const target = supabaseRef(targetUrl)
  if (!target) return 'No staging (target) database URL given.'
  const source = supabaseRef(sourceUrl)
  if (target === LIVE_SUPABASE_REF) return 'The target is the LIVE database. Nothing was copied.'
  if (source === target) return 'Source and target are the same database. Nothing was copied.'
  return null
}

/** The live project (go4solar, eu-west-1). */
export const LIVE_SUPABASE_REF = 'moqcgqrcmtzovsmtwkna'

/** A row as it goes into staging: who created/changed it (staff) and contact emails removed. */
export function cleanRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (GENERATED[table]?.includes(k)) continue
    out[k] = k.endsWith('_by') || BLANK[table]?.includes(k) ? null : v
  }
  return out
}

/** Pictures copied with the tables (products, roofs, partner logos). Never people's photos. */
export const MEDIA_FOLDERS = ['plan', 'roof', 'logo'] as const

/** Every live storage link inside a row, pointed at the same file in staging. */
export function rewriteHost<T>(value: T, fromUrl: string, toUrl: string): T {
  const from = fromUrl.replace(/\/$/, '')
  const to = toUrl.replace(/\/$/, '')
  if (typeof value === 'string') return value.split(from).join(to) as T
  if (Array.isArray(value)) return value.map((v) => rewriteHost(v, fromUrl, toUrl)) as T
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, rewriteHost(v, fromUrl, toUrl)]),
    ) as T
  return value
}
