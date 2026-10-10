'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { STAFF_ROLES } from '@/lib/auth/roles'
import { getSessionInfo, type SessionInfo } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

type Result = { ok: true } | { ok: false; error: string }

async function superAdmin(): Promise<SessionInfo | null> {
  const s = await getSessionInfo()
  return s.user && s.role === 'super_admin' && s.aal === 'aal2' ? s : null
}
const DENIED: Result = { ok: false, error: 'Only a super admin can manage staff.' }

const roleSchema = z.enum(STAFF_ROLES)
const inviteSchema = z.object({
  email: z.email('Enter a valid email address'),
  fullName: z.string().trim().min(2).max(80),
  role: roleSchema,
  assistedEntry: z.boolean(),
})
const updateSchema = z.object({
  profileId: z.uuid(),
  role: roleSchema,
  assistedEntry: z.boolean(),
})
const disableSchema = z.object({ profileId: z.uuid(), disabled: z.boolean() })

async function audit(
  session: SessionInfo,
  action: string,
  entityId: string,
  before: Json,
  after: Json,
) {
  await createAdminClient().from('audit_log').insert({
    actor_id: session.user!.id,
    action,
    entity: 'profiles',
    entity_id: entityId,
    before,
    after,
  })
}

/** Invite a new staff member: Supabase emails an invite link; the profile gets the role at once. */
export async function inviteStaff(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' }
  const d = parsed.data
  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.inviteUserByEmail(d.email, {
    data: { full_name: d.fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/login`,
  })
  if (error) return { ok: false, error: error.message }
  const id = data.user.id

  // The sign-up trigger created the profile as 'consumer'; set the role and permission.
  const { error: roleError } = await admin
    .from('profiles')
    .update({ role: d.role, full_name: d.fullName })
    .eq('id', id)
  if (roleError) return { ok: false, error: roleError.message }
  if (d.assistedEntry) {
    await admin
      .from('staff_permissions')
      .upsert({ profile_id: id, permission: 'assisted_entry', granted_by: session.user!.id })
  }
  await audit(session, 'staff.invite', id, null, {
    email: d.email,
    role: d.role,
    assistedEntry: d.assistedEntry,
  })
  revalidatePath('/admin/staff')
  return { ok: true }
}

/** Change a staff member's role and the assisted-entry permission. */
export async function updateStaff(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' }
  const d = parsed.data
  if (d.profileId === session.user!.id && d.role !== 'super_admin') {
    return { ok: false, error: 'You cannot remove your own super admin role.' }
  }
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('profiles')
    .select('role')
    .eq('id', d.profileId)
    .maybeSingle()
  const { data: perms } = await admin
    .from('staff_permissions')
    .select('permission')
    .eq('profile_id', d.profileId)
  const hadAssisted = (perms ?? []).some((p) => p.permission === 'assisted_entry')

  const { error } = await admin.from('profiles').update({ role: d.role }).eq('id', d.profileId)
  if (error) return { ok: false, error: error.message }
  if (d.assistedEntry && !hadAssisted) {
    await admin.from('staff_permissions').upsert({
      profile_id: d.profileId,
      permission: 'assisted_entry',
      granted_by: session.user!.id,
    })
  } else if (!d.assistedEntry && hadAssisted) {
    await admin
      .from('staff_permissions')
      .delete()
      .eq('profile_id', d.profileId)
      .eq('permission', 'assisted_entry')
  }
  await audit(
    session,
    'staff.update',
    d.profileId,
    { role: before?.role ?? null, assistedEntry: hadAssisted },
    { role: d.role, assistedEntry: d.assistedEntry },
  )
  revalidatePath('/admin/staff')
  return { ok: true }
}

/** Disable (ban) or re-enable a staff login. */
export async function setStaffDisabled(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = disableSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request' }
  const d = parsed.data
  if (d.profileId === session.user!.id)
    return { ok: false, error: 'You cannot disable your own account.' }
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(d.profileId, {
    ban_duration: d.disabled ? '876000h' : 'none',
  })
  if (error) return { ok: false, error: error.message }
  await audit(session, d.disabled ? 'staff.disable' : 'staff.enable', d.profileId, null, {
    disabled: d.disabled,
  })
  revalidatePath('/admin/staff')
  return { ok: true }
}
