'use server'

import { redirect } from 'next/navigation'

import { launchMode } from '@/config/site'
import { afterPasswordSet, amrMethods, canSetPassword } from '@/lib/auth/authLink'
import { setPasswordSchema } from '@/lib/auth/passwordSchema'
import type { AppRole } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type SetPasswordResult = { error: string }

const EXPIRED = 'This link has expired or was already used. Ask for a new one below.'

/**
 * Saves the password for the person signed in by an invite or password email link, then sends
 * staff on to the authenticator set-up. A normal password sign-in cannot use this.
 */
export async function setPassword(input: unknown): Promise<SetPasswordResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: EXPIRED }
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const methods = amrMethods(aal?.currentAuthenticationMethods)
  if (!canSetPassword(methods)) return { error: EXPIRED }

  const parsed = setPasswordSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form' }

  // The service role sets it: the link already proved the person owns the email, and a staff
  // account with an authenticator would otherwise need a code before it could change it.
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  })
  if (error) {
    if ((error as { code?: string }).code === 'weak_password') {
      return { error: 'That password is too easy to guess. Please choose another.' }
    }
    console.error(`[auth] could not set password: ${error.message}`)
    return { error: 'Could not save your password. Please try again.' }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  await admin.from('audit_log').insert({
    actor_id: user.id,
    action: 'auth.password_set',
    entity: 'profiles',
    entity_id: user.id,
    before: null,
    after: { via: methods.find((m) => canSetPassword([m])) ?? 'link' },
  })
  // Supabase ends every session when the password changes: sign in again with the new one.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email ?? '',
    password: parsed.data.password,
  })
  if (signInError) redirect('/login?password=set')
  redirect(afterPasswordSet((profile?.role as AppRole | undefined) ?? null, launchMode()))
}
