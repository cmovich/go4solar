'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'

import { getSessionInfo, type SessionInfo } from '@/lib/auth/session'
import {
  accessoryRulesSchema,
  builderSettingsSchema,
  logisticsSchema,
  rackPricesSchema,
} from '@/lib/catalogue/adminSchemas'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

async function superAdmin(): Promise<SessionInfo | null> {
  const s = await getSessionInfo()
  return s.user && s.role === 'super_admin' && s.aal === 'aal2' ? s : null
}
const DENIED: Result = { ok: false, error: 'Only a super admin can change pricing.' }
const invalid = (e: z.ZodError): Result => ({
  ok: false,
  error: e.issues[0]?.message ?? 'Check the values',
})

/** Writes run as the staff member (RLS); the database trigger logs every row, this adds a summary. */
async function audit(s: SessionInfo, action: string, entity: string, before: Json, after: Json) {
  await createAdminClient().from('audit_log').insert({
    actor_id: s.user!.id,
    action,
    entity,
    entity_id: null,
    before,
    after,
  })
}

function changed() {
  revalidatePath('/admin/pricing/builder')
  revalidatePath('/build')
  revalidatePath('/waitlist')
  revalidatePath('/get-started')
  revalidatePath('/')
}

/** Auto-pick rules: replace the whole table (saving confirms them: no longer SAMPLE). */
export async function saveAccessoryRules(input: unknown): Promise<Result> {
  const s = await superAdmin()
  if (!s) return DENIED
  const p = accessoryRulesSchema.safeParse(input)
  if (!p.success) return invalid(p.error)
  const supabase = await createClient()
  const { data: before } = await supabase.from('accessory_rules').select('*')
  const keep = p.data.map((r) => r.maxKva)
  const gone = (before ?? []).filter((r) => !keep.includes(Number(r.max_kva))).map((r) => r.id)
  if (gone.length) {
    const { error } = await supabase.from('accessory_rules').delete().in('id', gone)
    if (error) return { ok: false, error: 'Could not save the rules. Please try again.' }
  }
  const { error } = await supabase.from('accessory_rules').upsert(
    p.data.map((r) => ({
      max_kva: r.maxKva,
      dc_breaker_a: r.dcBreakerA,
      ac_breaker_a: r.acBreakerA,
      dc_surge_v: r.dcSurgeV,
      ac_surge_ka: r.acSurgeKa,
      battery_breaker_a: r.batteryBreakerA,
      changeover_a: r.changeoverA,
      regulator_kva: r.regulatorKva,
      box_ways: r.boxWays,
      trunk_pipe_mm: r.trunkPipeMm,
      flex_pipe_mm: r.flexPipeMm,
      ac_wire_mm2: r.acWireMm2,
      dc_wire_mm2: r.dcWireMm2,
      trunk_pipe_m: r.trunkPipeM,
      flex_pipe_m: r.flexPipeM,
      sample: false,
    })),
    { onConflict: 'max_kva' },
  )
  if (error) return { ok: false, error: 'Could not save the rules. Please try again.' }
  await audit(
    s,
    'pricing.accessory_rules.update',
    'accessory_rules',
    (before ?? []) as unknown as Json,
    p.data as unknown as Json,
  )
  changed()
  return { ok: true }
}

export async function saveRackPrices(input: unknown): Promise<Result> {
  const s = await superAdmin()
  if (!s) return DENIED
  const p = rackPricesSchema.safeParse(input)
  if (!p.success) return invalid(p.error)
  const supabase = await createClient()
  const { data: before } = await supabase.from('rack_prices').select('*')
  const { error } = await supabase.from('rack_prices').upsert([
    { material: 'metal', price_per_cm: p.data.metal, sample: false },
    { material: 'aluminium', price_per_cm: p.data.aluminium, sample: false },
  ])
  if (error) return { ok: false, error: 'Could not save the rack prices. Please try again.' }
  await audit(
    s,
    'pricing.rack_prices.update',
    'rack_prices',
    (before ?? []) as unknown as Json,
    p.data as unknown as Json,
  )
  changed()
  return { ok: true }
}

export async function saveBuilderSettings(input: unknown): Promise<Result> {
  const s = await superAdmin()
  if (!s) return DENIED
  const p = builderSettingsSchema.safeParse(input)
  if (!p.success) return invalid(p.error)
  const supabase = await createClient()
  const { data: before } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'builder')
    .maybeSingle()
  const value = { ...p.data, sample: false }
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'builder', value, updated_by: s.user!.id, updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: 'Could not save the settings. Please try again.' }
  await audit(
    s,
    'pricing.builder.update',
    'settings.builder',
    (before?.value ?? null) as Json,
    value as Json,
  )
  changed()
  return { ok: true }
}

/** Delivery per state: saved rows are confirmed (no longer SAMPLE); states left out are removed. */
export async function saveLogistics(input: unknown): Promise<Result> {
  const s = await superAdmin()
  if (!s) return DENIED
  const p = logisticsSchema.safeParse(input)
  if (!p.success) return invalid(p.error)
  const supabase = await createClient()
  const { data: before } = await supabase.from('logistics_costs').select('*')
  const keep = p.data.map((r) => r.state)
  const gone = (before ?? []).filter((r) => !keep.includes(r.state)).map((r) => r.state)
  if (gone.length) {
    const { error } = await supabase.from('logistics_costs').delete().in('state', gone)
    if (error) return { ok: false, error: 'Could not save delivery prices. Please try again.' }
  }
  const { error } = await supabase.from('logistics_costs').upsert(
    p.data.map((r) => ({
      state: r.state,
      amount: r.amount,
      extra_per_panel: r.extraPerPanel,
      local_vendors_available: r.localVendorsAvailable,
      sample: false,
    })),
  )
  if (error) return { ok: false, error: 'Could not save delivery prices. Please try again.' }
  await audit(
    s,
    'pricing.logistics.update',
    'logistics_costs',
    (before ?? []) as unknown as Json,
    p.data as unknown as Json,
  )
  changed()
  return { ok: true }
}
