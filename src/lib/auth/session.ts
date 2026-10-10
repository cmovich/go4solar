import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

export type AppRole = Database['public']['Enums']['app_role']

/** MFA assurance level of the current session: aal2 = verified with an authenticator this session. */
export type Aal = 'aal1' | 'aal2'

export type SessionInfo = {
  user: { id: string; email: string | null } | null
  role: AppRole | null
  aal: Aal | null
  /** Email confirmed through our own verification link (profiles.email_verified_at). */
  emailVerified?: boolean
}

/**
 * Who is calling, what role they have, and whether they passed MFA this session.
 * Server only (reads auth cookies). Mocked in tests.
 */
export async function getSessionInfo(): Promise<SessionInfo> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null, aal: null }

  const [{ data: profile }, { data: mfa }] = await Promise.all([
    supabase.from('profiles').select('role, email_verified_at').eq('id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])

  const level = mfa?.currentLevel
  return {
    user: { id: user.id, email: user.email ?? null },
    role: profile?.role ?? null,
    aal: level === 'aal2' ? 'aal2' : level === 'aal1' ? 'aal1' : null,
    emailVerified: Boolean(profile?.email_verified_at),
  }
}
