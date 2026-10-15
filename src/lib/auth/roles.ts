import { redirect } from 'next/navigation'

import { getSessionInfo, type AppRole, type SessionInfo } from './session'

import { isStaffRole } from './staffRoles'

export { STAFF_ROLES, isStaffRole, type StaffRole } from './staffRoles'

function loginUrl(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login'
}

/** Any logged-in user. Otherwise redirects to /login (and back to `next` after login). */
export async function requireUser(next?: string): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl(next))
  return info
}

/** A logged-in user whose role is one of `roles`. Wrong role → home page. */
export async function requireRole(...roles: AppRole[]): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl())
  if (!info.role || !roles.includes(info.role)) redirect('/')
  return info
}

/**
 * Staff only, and the session must be at MFA level `aal2`.
 * Staff who have not enrolled or verified their authenticator go to /admin/mfa.
 */
export async function requireStaffWithMfa(): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl('/admin'))
  if (!isStaffRole(info.role)) redirect('/')
  if (info.aal !== 'aal2') redirect('/admin/mfa')
  return info
}

/**
 * A signed-in user whose email has been confirmed through our verification link. Required before
 * the Terms/signature step (Prompt 11); otherwise back to the application with a prompt to verify.
 */
export async function requireVerifiedEmail(next = '/app/apply'): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl(next))
  if (!info.emailVerified) redirect('/app/apply?verify=email')
  return info
}
