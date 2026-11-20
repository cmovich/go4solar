'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { decideItem } from '@/lib/tradeLenda/server'

/** Trade Lenda marks one customer Approved / Declined / Needs info (audited). */
export async function decideFunderItem(input: unknown) {
  const s = await getSessionInfo()
  if (!s.user || s.aal !== 'aal2') return { ok: false as const, error: 'Please sign in again.' }
  const p = z
    .object({
      itemId: z.uuid(),
      batchId: z.uuid(),
      decision: z.enum(['approved', 'declined', 'needs_info']),
      note: z.string().max(1000).nullable(),
    })
    .safeParse(input)
  if (!p.success) return { ok: false as const, error: 'Check the decision.' }
  const r = await decideItem({ id: s.user.id, role: s.role }, p.data)
  if (r.ok) revalidatePath(`/admin/funder/${p.data.batchId}`)
  return r
}
