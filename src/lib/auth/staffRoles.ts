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
