'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

import { decideChange } from '@/lib/account/changes'
import { siteOrigin } from '@/lib/auth/emailVerification'
import { requireStaffWithMfa } from '@/lib/auth/roles'

/** Approve or reject a customer's change request (super admin or operations; audited). */
export async function decideChangeRequest(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin' && session.role !== 'operations') {
    return { ok: false, error: 'Only a super admin or operations can decide change requests.' }
  }
  const r = await decideChange(session.user!.id, input, siteOrigin(await headers()))
  if (r.ok) revalidatePath('/admin/change-requests')
  return r
}
