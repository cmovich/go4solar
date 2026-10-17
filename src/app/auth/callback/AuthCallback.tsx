'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'

import { AuthShell, LinkExpired } from '@/components/auth/AuthShell'
import { parseAuthLink } from '@/lib/auth/authLink'
import { publicSupabaseEnv } from '@/lib/supabase/env'

/**
 * Supabase sends the invite / password link back with the session in the URL fragment, which
 * only the browser can see. Store it as the usual auth cookies, wipe it from the address bar,
 * then open "Set your password". A used or expired link shows how to get a new one.
 */
export function AuthCallback() {
  const [state, setState] = useState<'working' | 'expired'>('working')

  useEffect(() => {
    const link = parseAuthLink(window.location.hash, window.location.search)
    // Never leave tokens in the address bar or the browser history.
    window.history.replaceState(null, '', window.location.pathname)
    if (link.kind !== 'session') {
      setState('expired')
      return
    }
    const { url, anonKey } = publicSupabaseEnv()
    const supabase = createBrowserClient(url, anonKey, { auth: { detectSessionInUrl: false } })
    supabase.auth
      .setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      .then(({ error }) => {
        if (error) setState('expired')
        else window.location.replace('/set-password')
      })
  }, [])

  if (state === 'expired') {
    return (
      <AuthShell title="This link no longer works">
        <LinkExpired />
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Opening your link…">
      <p className="text-muted-foreground text-sm" aria-busy="true">
        One moment.
      </p>
    </AuthShell>
  )
}
