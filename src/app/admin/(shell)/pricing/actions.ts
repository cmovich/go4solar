'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo, type SessionInfo } from '@/lib/auth/session'
import {
  SIZE_KEY,
  componentsSchema,
  energySizingSchema,
  installationSchema,
  lateFeeSchema,
  marginsSchema,
  ratesSchema,
  unitCostsSchema,
} from '@/lib/pricing/adminSchemas'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string; field?: string }

/** Only a super admin may change prices; the check runs before any database access. */
async function superAdmin(): Promise<SessionInfo | null> {
  const session = await getSessionInfo()
  return session.user && session.role === 'super_admin' && session.aal === 'aal2' ? session : null
}
const DENIED: Result = { ok: false, error: 'Only a super admin can change pricing.' }

function invalid(err: z.ZodError): Result {
  const issue = err.issues[0]
  return { ok: false, error: issue?.message ?? 'Check the values', field: issue?.path.join('.') }
}

/** Every pricing write leaves a before/after row in audit_log. */
async function audit(
  session: SessionInfo,
  action: string,
  entity: string,
  before: Json,
  after: Json,
) {
  const { error } = await createAdminClient().from('audit_log').insert({
    actor_id: session.user!.id,
    action,
    entity,
    entity_id: null,
    before,
    after,
  })
  if (error) console.error('[audit] insert failed:', error.message)
}

function done(): Result {
  revalidatePath('/admin/pricing')
  revalidatePath('/')
  return { ok: true }
}

export async function saveMargins(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = marginsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { data: current } = await supabase.from('category_margins').select('category, margin')
  const before = Object.fromEntries((current ?? []).map((m) => [m.category, Number(m.margin)]))

  const { error } = await supabase.from('category_margins').upsert(
    (['panels', 'battery', 'inverter', 'accessories'] as const).map((category) => ({
      category,
      margin: parsed.data[category],
      sample: false,
    })),
  )
  if (error) return { ok: false, error: error.message }
  await audit(session, 'pricing.margins.update', 'category_margins', before, parsed.data)
  return done()
}

export async function saveComponents(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = componentsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const skus = parsed.data.map((c) => c.sku)
  if (new Set(skus).size !== skus.length)
    return { ok: false, error: 'SKUs must be unique', field: 'sku' }

  const supabase = await createClient()
  const { data: current } = await supabase
    .from('components')
    .select('id, sku, unit_cost, active, stock_sizes')
  const rows = parsed.data.map((c) => ({
    ...(c.id ? { id: c.id } : {}),
    sku: c.sku,
    name: c.name,
    category: c.category,
    unit_cost: c.unitCost,
    stock_sizes: { [SIZE_KEY[c.category]]: c.size },
    source: c.source,
    active: c.active,
    sample: c.sample,
  }))
  const { error } = await supabase.from('components').upsert(rows, { onConflict: 'sku' })
  if (error) return { ok: false, error: error.message }
  await audit(
    session,
    'pricing.components.update',
    'components',
    (current ?? []) as unknown as Json,
    rows as unknown as Json,
  )
  return done()
}

export async function saveRates(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = ratesSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { data: current } = await supabase
    .from('pricing_rates')
    .select('tenure_months, expected_funder_rate, spread, default_buffer')
  const { error } = await supabase.from('pricing_rates').upsert(
    parsed.data.map((r) => ({
      tenure_months: r.tenureMonths,
      expected_funder_rate: r.expectedFunderRate,
      spread: r.spread,
      default_buffer: r.defaultBuffer,
      sample: false,
    })),
  )
  if (error) return { ok: false, error: error.message }
  await audit(
    session,
    'pricing.rates.update',
    'pricing_rates',
    (current ?? []) as unknown as Json,
    parsed.data,
  )
  return done()
}

export async function saveInstallation(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = installationSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { data: current } = await supabase
    .from('installation_costs')
    .select('state, size_band, amount')
  const { error } = await supabase.from('installation_costs').upsert(
    parsed.data.map((r) => ({
      state: r.state,
      size_band: r.sizeBand,
      amount: r.amount,
      sample: false,
    })),
    { onConflict: 'state,size_band' },
  )
  if (error) return { ok: false, error: error.message }
  await audit(
    session,
    'pricing.installation.update',
    'installation_costs',
    (current ?? []) as unknown as Json,
    parsed.data,
  )
  return done()
}

export async function saveUnitCosts(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = unitCostsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { data: current } = await supabase.from('unit_costs').select('*').eq('id', 1).maybeSingle()
  const { error } = await supabase.from('unit_costs').upsert({
    id: 1,
    kyc_per_loan: parsed.data.kycPerLoan,
    fee_per_instalment: parsed.data.feePerInstalment,
    loss_provision_share: parsed.data.lossProvisionShare,
    min_net_margin_share: parsed.data.minNetMarginShare,
    sample: false,
  })
  if (error) return { ok: false, error: error.message }
  await audit(
    session,
    'pricing.unit_costs.update',
    'unit_costs',
    (current ?? null) as unknown as Json,
    parsed.data,
  )
  return done()
}

/** Settings rows (late fee, energy, sizing, min deposit) are written by super_admin under RLS. */
async function saveSetting(session: SessionInfo, key: string, value: Json, action: string) {
  const supabase = await createClient()
  const { data: current } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_by: session.user!.id, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  await audit(session, action, `settings.${key}`, (current?.value ?? null) as Json, value)
}

export async function saveLateFee(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = lateFeeSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  try {
    await saveSetting(session, 'late_fee_daily', parsed.data.dailyRate, 'pricing.late_fee.update')
    await saveSetting(
      session,
      'late_fee_cap_share',
      parsed.data.capShare,
      'pricing.late_fee.update',
    )
    await saveSetting(
      session,
      'lock_after_days_overdue',
      parsed.data.lockAfterDays,
      'pricing.lock_rule.update',
    )
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  return done()
}

export async function saveEnergySizing(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = energySizingSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  try {
    await saveSetting(
      session,
      'energy',
      parsed.data.energy as unknown as Json,
      'pricing.energy.update',
    )
    await saveSetting(
      session,
      'sizing',
      parsed.data.sizing as unknown as Json,
      'pricing.sizing.update',
    )
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  revalidatePath('/waitlist')
  return done()
}
