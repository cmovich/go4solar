'use server'

import { revalidatePath } from 'next/cache'
import { getSessionInfo } from '@/lib/auth/session'
import { applianceSchema } from '@/lib/pricing/adminSchemas'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true; id: string } | { ok: false; error: string; field?: string }

/** Edit (or add) one appliance in the library. super_admin only (RLS enforces it too). */
export async function saveAppliance(input: unknown): Promise<Result> {
  const session = await getSessionInfo()
  if (!session.user || session.role !== 'super_admin' || session.aal !== 'aal2') {
    return { ok: false, error: 'Only a super admin can edit the appliance library.' }
  }
  const parsed = applianceSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the values', field: issue?.path.join('.') }
  }
  const d = parsed.data
  const supabase = await createClient()
  const { data: before } = d.id
    ? await supabase.from('appliance_library').select('*').eq('id', d.id).maybeSingle()
    : { data: null }
  const row = {
    ...(d.id ? { id: d.id } : {}),
    category: d.category,
    name: d.name,
    default_watts: d.defaultWatts,
    surge_factor: d.surgeFactor,
    duty_cycle: d.dutyCycle,
    default_hours: d.defaultDayHours + d.defaultNightHours,
    default_day_hours: d.defaultDayHours,
    default_night_hours: d.defaultNightHours,
    default_essential: d.defaultEssential,
    sort: d.sort,
    active: d.active,
  }
  const { data, error } = await supabase.from('appliance_library').upsert(row).select('id').single()
  if (error) return { ok: false, error: error.message }
  await createAdminClient()
    .from('audit_log')
    .insert({
      actor_id: session.user.id,
      action: d.id ? 'appliances.update' : 'appliances.create',
      entity: 'appliance_library',
      entity_id: data.id,
      before: (before ?? null) as unknown as Json,
      after: row as unknown as Json,
    })
  revalidatePath('/admin/appliances')
  revalidatePath('/calculate')
  revalidatePath('/waitlist')
  return { ok: true, id: data.id }
}
