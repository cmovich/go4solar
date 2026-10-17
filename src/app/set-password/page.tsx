import type { Metadata } from 'next'

import { AuthShell, LinkExpired } from '@/components/auth/AuthShell'
import { amrMethods, canSetPassword } from '@/lib/auth/authLink'
import { createClient } from '@/lib/supabase/server'

import { SetPasswordForm } from './SetPasswordForm'

export const metadata: Metadata = { title: 'Set your password', robots: { index: false } }

// Depends on the visitor's session: never prerendered at build time.
export const dynamic = 'force-dynamic'

/** Reached from an invite or "forgot password" email (via /auth/callback). */
export default async function SetPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: aal } = user
    ? await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    : { data: null }
  const methods = amrMethods(aal?.currentAuthenticationMethods)

  if (!user || !canSetPassword(methods)) {
    return (
      <AuthShell title="Set your password">
        <LinkExpired />
      </AuthShell>
    )
  }
  return (
    <AuthShell
      title="Set your password"
      description={
        <>
          Choose a password for <span className="text-brand-dark font-medium">{user.email}</span>.
          Use at least 12 characters; a short sentence is easy to remember.
        </>
      }
    >
      <SetPasswordForm />
    </AuthShell>
  )
}
