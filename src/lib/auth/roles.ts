import { redirect } from 'next/navigation'

import { getSessionInfo, type AppRole, type SessionInfo } from './session'

import {
  FUNDER_APPROVER_ROLE,
  FUNDER_PARTNER_ROLE,
  SALES_ROLE,
  canEditLeadProfile,
  isBackOfficeRole,
} from './staffRoles'

export {
  FUNDER_APPROVER_ROLE,
  FUNDER_PARTNER_ROLE,
  SALES_ROLE,
  STAFF_ROLES,
  isBackOfficeRole,
  isStaffRole,
  type StaffRole,
} from './staffRoles'

function loginUrl(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login'
}

/** Any logged-in user. Otherwise redirects to /login (and back to `next` after login). */
export async function requireUser(next?: string): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl(next))
  return info
}

/**
 * A logged-in user whose role is one of `roles`. Wrong role → home page (a funder approver →
 * the SPEWA approvals queue, the only back-office page it may use).
 */
export async function requireRole(...roles: AppRole[]): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl())
  if (!info.role || !roles.includes(info.role))
    redirect(
      info.role === FUNDER_APPROVER_ROLE
        ? '/admin/spewa'
        : info.role === FUNDER_PARTNER_ROLE
          ? '/admin/funder'
          : '/',
    )
  return info
}

/**
 * Staff only, and the session must be at MFA level `aal2`.
 * Staff who have not enrolled or verified their authenticator go to /admin/mfa.
 */
export async function requireStaffWithMfa(): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl('/admin'))
  if (!isBackOfficeRole(info.role)) redirect('/')
  if (info.aal !== 'aal2') redirect('/admin/mfa')
  // Sales may only use Quotations: every other back-office page sends them there.
  if (info.role === SALES_ROLE) redirect('/admin/quotations')
  // A funder approver may only use the SPEWA approvals queue.
  if (info.role === FUNDER_APPROVER_ROLE) redirect('/admin/spewa')
  // A funder (Trade Lenda) may only see its own batches.
  if (info.role === FUNDER_PARTNER_ROLE) redirect('/admin/funder')
  return info
}

/** Trade Lenda's pages (/admin/funder): the funder, or a super admin ("View as Trade Lenda"). */
export async function requireFunderViewer(): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl('/admin/funder'))
  if (!isBackOfficeRole(info.role)) redirect('/')
  if (info.aal !== 'aal2') redirect('/admin/mfa')
  if (info.role !== 'super_admin' && info.role !== FUNDER_PARTNER_ROLE) redirect('/admin')
  return info
}

/** Waiting-list profiles: super admin and Operations edit and send; Sales edits only. */
export async function requireLeadProfileEditor(): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl('/admin/waitlist'))
  if (!isBackOfficeRole(info.role)) redirect('/')
  if (info.aal !== 'aal2') redirect('/admin/mfa')
  if (!canEditLeadProfile(info.role)) redirect('/admin')
  return info
}

/**
 * The SPEWA approvals queue and its files: super admin, credit officer, or the funder approver,
 * two-factor verified. Everyone else in the back office goes to /admin.
 */
export async function requireFunderQueueViewer(): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl('/admin/spewa'))
  if (!isBackOfficeRole(info.role)) redirect('/')
  if (info.aal !== 'aal2') redirect('/admin/mfa')
  if (
    info.role !== 'super_admin' &&
    info.role !== 'credit_officer' &&
    info.role !== FUNDER_APPROVER_ROLE
  )
    redirect('/admin')
  return info
}

/**
 * Anyone who signs in to /admin (staff or sales), two-factor verified. Only for the admin shell
 * and the Quotations pages; everything else uses requireStaffWithMfa.
 */
export async function requireBackOfficeWithMfa(): Promise<SessionInfo> {
  const info = await getSessionInfo()
  if (!info.user) redirect(loginUrl('/admin'))
  if (!isBackOfficeRole(info.role)) redirect('/')
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
