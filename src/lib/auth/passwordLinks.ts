import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { publicSupabaseEnv } from '@/lib/supabase/env'

/** Where invite and password emails return to: the page that reads the link and signs in. */
export function authCallbackUrl(origin: string): string {
  return `${origin}/auth/callback`
}

/**
 * Asks Supabase to email a "set your password" link (a password-reset link). Uses the implicit
 * flow so the link works in any browser (the PKCE flow only works in the browser that asked).
 * Supabase answers the same whether or not the account exists.
 */
export async function sendPasswordLink(
  email: string,
  origin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { url, anonKey } = publicSupabaseEnv()
  const client = createSupabaseClient(url, anonKey, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: authCallbackUrl(origin),
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}
