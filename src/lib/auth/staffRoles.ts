import type { Database } from '@/lib/supabase/database.types'

export type AppRole = Database['public']['Enums']['app_role']

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

/**
 * Sales (installers, marketers): signs in to the back office with two-factor but sees only
 * Admin → Quotations. Not a staff role: every staff-only page, action and export refuses it, and
 * the database gives it no staff read access (public.is_staff() leaves it out).
 */
export const SALES_ROLE = 'sales' as const satisfies AppRole

/**
 * Funder approver (SPEWA): signs in to the back office with two-factor but sees only the SPEWA
 * approvals queue and the files in it. Not a staff role either (no staff read access in the
 * database; the server shows it the queue after checking the role).
 */
export const FUNDER_APPROVER_ROLE = 'funder_approver' as const satisfies AppRole

/**
 * Funder (Trade Lenda): signs in with two-factor and sees only the batches sent to its own funder
 * (/admin/funder). Not a staff role: no staff read access in the database; batches are limited to
 * its funder by the database (funder_users, my_funder_id()).
 */
export const FUNDER_PARTNER_ROLE = 'funder_partner' as const satisfies AppRole

/** Anyone who signs in to /admin: back-office staff, sales, or a funder. */
export function isBackOfficeRole(role: AppRole | null | undefined): boolean {
  return (
    isStaffRole(role) ||
    role === SALES_ROLE ||
    role === FUNDER_APPROVER_ROLE ||
    role === FUNDER_PARTNER_ROLE
  )
}

/** Edit waiting-list profiles: super admin, Operations, Sales. */
export const canEditLeadProfile = (role: AppRole | null | undefined) =>
  role === 'super_admin' || role === 'operations' || role === SALES_ROLE

/** Send entries to Trade Lenda (create batches): super admin only. */
export const canSendToFunder = (role: AppRole | null | undefined) => role === 'super_admin'
