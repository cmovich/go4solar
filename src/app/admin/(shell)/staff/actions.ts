'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { siteOrigin } from '@/lib/auth/emailVerification'
import { authCallbackUrl, sendPasswordLink } from '@/lib/auth/passwordLinks'
import { STAFF_ROLES, isStaffRole } from '@/lib/auth/roles'
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
  waitlistDelete: z.boolean().default(false),
})
const updateSchema = z.object({
  profileId: z.uuid(),
  role: roleSchema,
  assistedEntry: z.boolean(),
  waitlistDelete: z.boolean().default(false),
})

type Permission = 'assisted_entry' | 'waitlist_delete'

/** Give or take away one extra permission (only writes when it changes). */
async function setPermission(
  profileId: string,
  permission: Permission,
  had: boolean,
  want: boolean,
  grantedBy: string,
) {
  const admin = createAdminClient()
  if (want && !had) {
    await admin
      .from('staff_permissions')
      .upsert({ profile_id: profileId, permission, granted_by: grantedBy })
  } else if (!want && had) {
    await admin
      .from('staff_permissions')
      .delete()
      .eq('profile_id', profileId)
      .eq('permission', permission)
  }
}
const disableSchema = z.object({ profileId: z.uuid(), disabled: z.boolean() })
const resendSchema = z.object({ profileId: z.uuid() })

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

/**
 * Invite a new staff member: Supabase emails an invite link; the profile gets the role at once.
 * The link returns to /auth/callback → "Set your password" → /admin/mfa → /admin.
 */
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
    redirectTo: authCallbackUrl(siteOrigin(await headers())),
  })
  if (error) return { ok: false, error: error.message }
  const id = data.user.id

  // The sign-up trigger created the profile as 'consumer'; set the role and permission.
  const { error: roleError } = await admin
    .from('profiles')
    .update({ role: d.role, full_name: d.fullName })
    .eq('id', id)
  if (roleError) return { ok: false, error: roleError.message }
  await setPermission(id, 'assisted_entry', false, d.assistedEntry, session.user!.id)
  await setPermission(id, 'waitlist_delete', false, d.waitlistDelete, session.user!.id)
  await audit(session, 'staff.invite', id, null, {
    email: d.email,
    role: d.role,
    assistedEntry: d.assistedEntry,
    waitlistDelete: d.waitlistDelete,
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
  const hadDelete = (perms ?? []).some((p) => p.permission === 'waitlist_delete')

  const { error } = await admin.from('profiles').update({ role: d.role }).eq('id', d.profileId)
  if (error) return { ok: false, error: error.message }
  await setPermission(d.profileId, 'assisted_entry', hadAssisted, d.assistedEntry, session.user!.id)
  await setPermission(d.profileId, 'waitlist_delete', hadDelete, d.waitlistDelete, session.user!.id)
  await audit(
    session,
    'staff.update',
    d.profileId,
    { role: before?.role ?? null, assistedEntry: hadAssisted, waitlistDelete: hadDelete },
    { role: d.role, assistedEntry: d.assistedEntry, waitlistDelete: d.waitlistDelete },
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

/**
 * "Resend invite": a new link for a staff member who cannot sign in. An invite never opened is
 * sent again; once it was opened (account confirmed) Supabase cannot re-invite, so a "set your
 * password" link is sent instead. Both lead to the same "Set your password" page.
 */
export async function resendStaffInvite(input: unknown): Promise<Result> {
  const session = await superAdmin()
  if (!session) return DENIED
  const parsed = resendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request' }
  const { profileId } = parsed.data
  if (profileId === session.user!.id) {
    return {
      ok: false,
      error: 'You are already signed in. Use "Forgot password?" on the sign-in page if needed.',
    }
  }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .maybeSingle()
  if (!isStaffRole(profile?.role ?? null)) return { ok: false, error: 'Not a staff account.' }
  const { data, error: userError } = await admin.auth.admin.getUserById(profileId)
  const email = data?.user?.email
  if (userError || !email) return { ok: false, error: 'Could not find this account.' }

  const origin = siteOrigin(await headers())
  let sent: 'invite' | 'password_link'
  if (!data.user.email_confirmed_at) {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: authCallbackUrl(origin),
    })
    if (error) return { ok: false, error: error.message }
    sent = 'invite'
  } else {
    const r = await sendPasswordLink(email, origin)
    if (!r.ok) return { ok: false, error: r.error }
    sent = 'password_link'
  }
  await audit(session, 'staff.resend_invite', profileId, null, { sent })
  return { ok: true }
}
