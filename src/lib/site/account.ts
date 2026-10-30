import type { LaunchMode } from '@/config/site'

/**
 * Is there a Supabase sign-in cookie? Read in the browser only, so cached pages stay cached.
 * (An expired session still counts: /app sends the visitor to sign in again.)
 */
export function hasAuthCookie(cookie: string): boolean {
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookie)
}

/** "Sign in" / "My account" in the site header and footer: live mode only. */
export function accountLink(
  mode: LaunchMode,
  signedIn: boolean,
): { label: string; href: string } | null {
  if (mode !== 'live') return null
  return signedIn ? { label: 'My account', href: '/app' } : { label: 'Sign in', href: '/login' }
}
