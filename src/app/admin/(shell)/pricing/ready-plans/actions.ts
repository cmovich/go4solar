'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo, type SessionInfo } from '@/lib/auth/session'
import { planProblems, planToRow, readyPlanSchema } from '@/lib/readyPlans/schema'
import type { ReadyPlan } from '@/lib/readyPlans/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

type Result = { ok: true; id?: string } | { ok: false; error: string; field?: string }

async function superAdmin(): Promise<SessionInfo | null> {
  const s = await getSessionInfo()
  return s.user && s.role === 'super_admin' && s.aal === 'aal2' ? s : null
}
const DENIED: Result = { ok: false, error: 'Only a super admin can change ready-made plans.' }

async function audit(s: SessionInfo, action: string, id: string | null, before: Json, after: Json) {
  await createAdminClient().from('audit_log').insert({
    actor_id: s.user!.id,
    action,
    entity: 'ready_plans',
    entity_id: id,
    before,
    after,
  })
}

function refresh() {
  revalidatePath('/admin/pricing/ready-plans')
  revalidatePath('/')
  revalidatePath('/plans/[slug]', 'page')
}

/**
 * Save one plan. A new plan always starts SAMPLE (no naira shown to customers); editing never
 * changes the flag: only "Confirm prices" does.
 */
export async function saveReadyPlan(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const p = readyPlanSchema.safeParse(input)
  if (!p.success) {
    const issue = p.error.issues[0]
    return { ok: false, error: issue?.message ?? 'Check the plan', field: issue?.path.join('.') }
  }
  const plan = p.data as ReadyPlan
  const problem = planProblems(plan)[0]
  if (problem) return { ok: false, error: problem }
  const admin = createAdminClient()
  const before = plan.id
    ? (await admin.from('ready_plans').select('*').eq('id', plan.id).maybeSingle()).data
    : null
  if (plan.id && !before) return { ok: false, error: 'This plan no longer exists.' }
  const row = { ...planToRow(plan), sample: before ? before.sample : true }
  // Copies taken before the write (the audit row and the old picture).
  const previous = before ? { ...before } : null
  const oldImage = previous?.image ?? null
  const { data, error } = before
    ? await admin
        .from('ready_plans')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', before.id)
        .select('id')
        .single()
    : await admin.from('ready_plans').insert(row).select('id').single()
  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? `Another plan already uses the address "${plan.slug}".`
          : 'Could not save the plan. Please try again.',
    }
  }
  await audit(
    session,
    before ? 'ready_plan.update' : 'ready_plan.create',
    data.id,
    previous as Json,
    row as Json,
  )
  // A replaced picture: its old file leaves storage (never blocks the save).
  if (oldImage && oldImage !== row.image) await removeOldPicture(session, data.id, oldImage)
  refresh()
  return { ok: true, id: data.id }
}

async function removeOldPicture(session: SessionInfo, id: string, path: string) {
  const admin = createAdminClient()
  // Another plan may share the file (Relax Max started with Relax's photo): keep it then.
  const { data: users, error: readError } = await admin
    .from('ready_plans')
    .select('id')
    .eq('image', path)
    .limit(1)
  if (readError || (users ?? []).length > 0) return
  const { error } = await admin.storage.from('site-media').remove([path])
  if (error) {
    console.error(`[site-media] could not remove the old plan picture: ${error.message}`)
    return
  }
  await audit(session, 'site_media.delete', id, { paths: [path] }, null)
}

const idSchema = z.object({ id: z.string().min(1) })

/** "Confirm prices": customers now see naira for this plan. */
export async function confirmReadyPlan(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const p = idSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Plan not found.' }
  const { error } = await createAdminClient()
    .from('ready_plans')
    .update({ sample: false, updated_at: new Date().toISOString() })
    .eq('id', p.data.id)
  if (error) return { ok: false, error: 'Could not confirm the prices.' }
  await audit(session, 'ready_plan.confirm', p.data.id, { sample: true }, { sample: false })
  refresh()
  return { ok: true }
}

export async function setReadyPlanActive(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const p = idSchema.extend({ active: z.boolean() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Plan not found.' }
  const { error } = await createAdminClient()
    .from('ready_plans')
    .update({ active: p.data.active, updated_at: new Date().toISOString() })
    .eq('id', p.data.id)
  if (error) return { ok: false, error: 'Could not change the plan.' }
  await audit(
    session,
    p.data.active ? 'ready_plan.switch_on' : 'ready_plan.switch_off',
    p.data.id,
    { active: !p.data.active },
    { active: p.data.active },
  )
  refresh()
  return { ok: true }
}

/** Move a plan up or down the list (customers see this order). */
export async function moveReadyPlan(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const p = idSchema.extend({ direction: z.enum(['up', 'down']) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Plan not found.' }
  const admin = createAdminClient()
  const { data: all } = await admin.from('ready_plans').select('id, sort_order, name')
  const list = [...(all ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
  const i = list.findIndex((r) => r.id === p.data.id)
  const j = p.data.direction === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= list.length) return { ok: true }
  // Renumber in the new order so equal numbers never get stuck.
  const next = [...list]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  for (const [k, r] of next.entries()) {
    if (r.sort_order !== k + 1) {
      await admin
        .from('ready_plans')
        .update({ sort_order: k + 1 })
        .eq('id', r.id)
    }
  }
  await audit(
    session,
    'ready_plan.move',
    p.data.id,
    list.map((r) => r.id) as Json,
    next.map((r) => r.id) as Json,
  )
  refresh()
  return { ok: true }
}
