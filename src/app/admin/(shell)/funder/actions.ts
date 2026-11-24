'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { setOnboardingLink } from '@/lib/exports/onboardingServer'
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

/** The funder adds or clears an onboarding link (one person, or the whole batch). */
export async function saveOnboardingLink(input: unknown) {
  const s = await getSessionInfo()
  if (!s.user || s.aal !== 'aal2') return { ok: false as const, error: 'Please sign in again.' }
  const p = z
    .object({
      batchId: z.uuid(),
      itemId: z.uuid().nullable(),
      url: z.string().max(500),
      viewAs: z.uuid().nullable().optional(),
    })
    .safeParse(input)
  if (!p.success) return { ok: false as const, error: 'Check the link.' }
  const r = await setOnboardingLink(p.data, { id: s.user.id, role: s.role })
  if (r.ok) revalidatePath(`/admin/funder/${p.data.batchId}`)
  return r
}
