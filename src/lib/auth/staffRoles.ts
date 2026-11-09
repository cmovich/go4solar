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

/** Anyone who signs in to /admin: back-office staff, or sales. */
export function isBackOfficeRole(role: AppRole | null | undefined): boolean {
  return isStaffRole(role) || role === SALES_ROLE
}
