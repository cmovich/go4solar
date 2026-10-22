import { z } from 'zod'

import { isStaffRole, type AppRole } from '@/lib/auth/staffRoles'

/** Pure helpers for deleting waiting-list entries (Part W). */

export type ContactRow = { id: string; phone: string; email: string | null }
export type DuplicateMatch = { phone: string[]; email: string[] }

const normEmail = (e: string | null) => e?.trim().toLowerCase() || null

/**
 * "Possible duplicate": the phone or the email (ignoring case) matches another entry.
 * Returns only the entries that match something, with the ids they match.
 */
export function possibleDuplicates(rows: ContactRow[]): Map<string, DuplicateMatch> {
  const byPhone = new Map<string, string[]>()
  const byEmail = new Map<string, string[]>()
  for (const r of rows) {
    byPhone.set(r.phone, [...(byPhone.get(r.phone) ?? []), r.id])
    const e = normEmail(r.email)
    if (e) byEmail.set(e, [...(byEmail.get(e) ?? []), r.id])
  }
  const out = new Map<string, DuplicateMatch>()
  for (const r of rows) {
    const phone = (byPhone.get(r.phone) ?? []).filter((id) => id !== r.id)
    const e = normEmail(r.email)
    const email = e ? (byEmail.get(e) ?? []).filter((id) => id !== r.id) : []
    if (phone.length || email.length) out.set(r.id, { phone, email })
  }
  return out
}

export const DELETE_REASONS = ['duplicate', 'test', 'other'] as const
export type DeleteReason = (typeof DELETE_REASONS)[number]
export const DELETE_REASON_LABELS: Record<DeleteReason, string> = {
  duplicate: 'Duplicate',
  test: 'Test user',
  other: 'Other',
}

export const deleteReasonSchema = z
  .object({
    reason: z.enum(DELETE_REASONS),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.reason !== 'other' || Boolean(v.note), {
    message: 'Say why this entry is being deleted.',
    path: ['note'],
  })

/** Who may delete waiting-list entries: a super admin, or staff given the waitlist_delete permission. */
export function canDeleteWaitlist(
  role: AppRole | null | undefined,
  hasPermission: boolean,
): boolean {
  if (role === 'super_admin') return true
  return isStaffRole(role) && hasPermission
}
