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
  type ComponentDraft,
} from '@/lib/pricing/adminSchemas'
import {
  componentDbErrorMessage,
  componentIssueMessage,
  duplicateSkuMessage,
} from '@/lib/pricing/componentErrors'
import { DEFAULT_MIN_DEPOSIT_SHARE } from '@/lib/pricing/price'
import { tenureListProblem, tenureRateProblem } from '@/lib/pricing/tenures'
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

/**
 * Saves the whole components list in one request (one database transaction): either every row
 * is saved or none is. Rows are matched on id; new rows have no id and get one from the
 * database default (`defaultToNull: false`; otherwise the missing id is sent as null).
 */
export async function saveComponents(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const drafts = (Array.isArray(input) ? input : []) as ComponentDraft[]
  const parsed = componentsSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return issue
      ? { ok: false, error: componentIssueMessage(issue, drafts), field: issue.path.join('.') }
      : { ok: false, error: 'Check the values' }
  }
  const duplicate = duplicateSkuMessage(parsed.data)
  if (duplicate) return { ok: false, error: duplicate, field: 'sku' }

  const supabase = await createClient()
  const { data: current } = await supabase
    .from('components')
    .select('id, sku, unit_cost, active, stock_sizes')
  const rows = parsed.data.map((c) => ({
    ...(c.id ? { id: c.id } : {}),
    sku: c.sku.toUpperCase(),
    name: c.name,
    category: c.category,
    unit_cost: c.unitCost,
    stock_sizes: { [SIZE_KEY[c.category]]: c.size },
    source: c.source,
    active: c.active,
    sample: c.sample,
  }))
  const { error } = await supabase
    .from('components')
    .upsert(rows, { onConflict: 'id', defaultToNull: false })
  if (error) {
    console.error(`[pricing] components not saved: ${error.code} ${error.message}`)
    return { ok: false, error: componentDbErrorMessage(error, parsed.data) }
  }
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
  // The rate limit for long tenures depends on the lowest deposit allowed.
  const { data: minRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'min_deposit_share')
    .maybeSingle()
  const minDeposit = z.number().safeParse(minRow?.value).data ?? DEFAULT_MIN_DEPOSIT_SHARE
  const problem =
    tenureListProblem(parsed.data) ??
    parsed.data.map((r) => tenureRateProblem(r, minDeposit)).find((p) => p !== null) ??
    null
  if (problem) return { ok: false, error: problem }

  const { data: current } = await supabase.from('pricing_rates').select('*')
  const { error } = await supabase.from('pricing_rates').upsert(
    parsed.data.map((r) => ({
      tenure_months: r.tenureMonths,
      enabled: r.enabled,
      expected_funder_rate: r.expectedFunderRate,
      spread: r.spread,
      default_buffer: r.defaultBuffer,
      sample: false,
    })),
  )
  if (error) return { ok: false, error: error.message }
  // Old quotes keep their snapshot; only new quotes use these rates.
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

const confirmSchema = z.object({
  section: z.enum(['components', 'margins', 'rates', 'installation', 'unit-costs', 'energy']),
  /** Rows to confirm; omitted = every SAMPLE row in the section ("Confirm all in this section"). */
  keys: z.array(z.string().min(1).max(80)).max(200).optional(),
})
const INSTALL_KEY = /^([A-Za-z ]+):(small|medium|large)$/

/**
 * "Confirm as real price": clears the SAMPLE flag without changing any value, for one row or a
 * whole section. Super admin only; audited (the database trigger also records each row).
 */
export async function confirmSamplePrices(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = confirmSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request' }
  const { section, keys } = parsed.data
  if (section === 'installation' && keys?.some((k) => !INSTALL_KEY.test(k))) {
    return { ok: false, error: 'Check the request' }
  }
  if (section === 'rates' && keys?.some((k) => !/^\d{1,2}$/.test(k))) {
    return { ok: false, error: 'Check the request' }
  }

  const supabase = await createClient()
  const off = { sample: false }
  let error: { message: string } | null = null
  let entity: string = section
  if (section === 'components') {
    entity = 'components'
    let q = supabase.from('components').update(off).eq('sample', true).eq('active', true)
    if (keys) q = q.in('id', keys)
    ;({ error } = await q)
  } else if (section === 'margins') {
    entity = 'category_margins'
    let q = supabase.from('category_margins').update(off).eq('sample', true)
    if (keys) q = q.in('category', keys as ('panels' | 'battery' | 'inverter' | 'accessories')[])
    ;({ error } = await q)
  } else if (section === 'rates') {
    // Switched-off tenures are never shown to customers: they need no confirming.
    entity = 'pricing_rates'
    let q = supabase.from('pricing_rates').update(off).eq('sample', true).eq('enabled', true)
    if (keys) q = q.in('tenure_months', keys.map(Number))
    ;({ error } = await q)
  } else if (section === 'installation') {
    entity = 'installation_costs'
    if (!keys) {
      ;({ error } = await supabase.from('installation_costs').update(off).eq('sample', true))
    } else {
      for (const k of keys) {
        const [, state, band] = INSTALL_KEY.exec(k)!
        const r = await supabase
          .from('installation_costs')
          .update(off)
          .eq('state', state!)
          .eq('size_band', band as 'small' | 'medium' | 'large')
        if (r.error) {
          error = r.error
          break
        }
      }
    }
  } else if (section === 'unit-costs') {
    entity = 'unit_costs'
    ;({ error } = await supabase.from('unit_costs').update(off).eq('id', 1))
  } else {
    entity = 'settings.energy'
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'energy')
      .maybeSingle()
    const value = data?.value
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      try {
        await saveSetting(session, 'energy', { ...value, sample: false }, 'pricing.energy.update')
      } catch {
        return { ok: false, error: 'Could not confirm. Please try again.' }
      }
    }
  }
  if (error) return { ok: false, error: 'Could not confirm. Please try again.' }
  await audit(session, 'pricing.sample.confirm', entity, null, {
    section,
    keys: keys ?? 'all',
  } as Json)
  return done()
}
