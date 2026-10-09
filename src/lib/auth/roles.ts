import { redirect } from 'next/navigation'

import { getSessionInfo, type AppRole, type SessionInfo } from './session'

/** Back-office roles. Everyone else (consumer, guarantor, installer, vendor) is a customer or partner. */
export const STAFF_ROLES = [
  'super_admin',
  'credit_officer',
  'operations',
  'collections',
  'finance',
  'content',
] as const satisfies readonly AppRole[]

export type StaffRole = (typeof STAFF_ROLES)[number]

export function isStaffRole(role: AppRole | null | undefined): role is StaffRole {
  return role != null && (STAFF_ROLES as readonly string[]).includes(role)
}

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
