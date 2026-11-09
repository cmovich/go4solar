'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireStaffWithMfa } from '@/lib/auth/roles'
import { createStaffQuotation, markShared, mayCreateQuotations } from '@/lib/staffQuotes/server'

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; field?: string }

const DENIED = { ok: false as const, error: 'You do not have the "Create quotations" permission.' }

/** "Create quotation": super admins, or staff given the create_quotations permission. */
export async function createQuotation(input: unknown): Promise<Result<{ id: string }>> {
  const session = await requireStaffWithMfa()
  if (!(await mayCreateQuotations(session))) return DENIED
  const r = await createStaffQuotation(session, input)
  if (r.ok) revalidatePath('/admin/quotations')
  return r
}

/** "Share on WhatsApp" / "Copy link": records the first share. */
export async function recordShare(input: unknown): Promise<Result<object>> {
  const session = await requireStaffWithMfa()
  if (!(await mayCreateQuotations(session))) return DENIED
  const p = z.object({ id: z.uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'This quotation could not be found.' }
  const r = await markShared(session, p.data.id)
  if (r.ok) revalidatePath('/admin/quotations')
  return r
}
