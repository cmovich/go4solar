import type { LaunchMode } from '@/config/site'

import type { AppRole } from './session'
import { isStaffRole } from './staffRoles'

export type AuthLinkResult =
  { kind: 'session'; accessToken: string; refreshToken: string; type: string } | { kind: 'expired' }

/**
 * Invite and password emails open Supabase's link, which sends the browser back to
 * /auth/callback with the new session in the URL fragment (`#access_token=…`). A used or expired
 * link comes back with an error instead (in the fragment or the query). Anything else is treated
 * as a broken link. Pure, so it is unit-tested.
 */
export function parseAuthLink(hash: string, search: string): AuthLinkResult {
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const query = new URLSearchParams(search.replace(/^\?/, ''))
  if (fragment.has('error') || query.has('error')) return { kind: 'expired' }
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  if (!accessToken || !refreshToken) return { kind: 'expired' }
  return { kind: 'session', accessToken, refreshToken, type: fragment.get('type') ?? '' }
}

/** The session's sign-in methods (`amr`); Supabase gives entries as objects or plain strings. */
export function amrMethods(
  entries: ReadonlyArray<string | { method: string }> | undefined,
): string[] {
  return (entries ?? []).map((e) => (typeof e === 'string' ? e : e.method))
}

/** Sign-in methods (the session's `amr`) that came from a link emailed to the person. */
const LINK_METHODS = new Set(['invite', 'recovery', 'otp'])

/**
 * Only a session opened from an emailed link may set a password without the old one. A normal
 * password sign-in cannot (someone at an unlocked screen could otherwise change it).
 */
export function canSetPassword(methods: string[]): boolean {
  return methods.some((m) => LINK_METHODS.has(m))
}

/** After choosing a password: staff set up the authenticator (then /admin); customers continue. */
export function afterPasswordSet(role: AppRole | null, mode: LaunchMode): string {
  if (isStaffRole(role)) return '/admin/mfa'
  return mode === 'live' ? '/app' : '/'
}
