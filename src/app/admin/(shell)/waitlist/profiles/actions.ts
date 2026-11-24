'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { setConsent } from '@/lib/exports/consents'
import { sendOnboardingLink } from '@/lib/exports/onboardingServer'
import { createBatch, saveProfile, setTick, updateBatch, type Actor } from '@/lib/tradeLenda/server'

async function actor(): Promise<Actor | null> {
  const s = await getSessionInfo()
  return s.user && s.aal === 'aal2' ? { id: s.user.id, role: s.role } : null
}
const SIGNED_OUT = { ok: false as const, error: 'Please sign in again.' }

export async function saveLeadProfile(waitlistId: string, input: unknown) {
  const a = await actor()
  if (!a || !z.uuid().safeParse(waitlistId).success) return SIGNED_OUT
  const r = await saveProfile(waitlistId, input, a)
  if (r.ok) revalidatePath(`/admin/waitlist/${waitlistId}/edit`)
  return r
}

const tickSchema = z.object({
  waitlistId: z.uuid(),
  kind: z.enum(['phone', 'consent', 'figures']),
  on: z.boolean(),
  note: z.string().max(500).nullable().optional(),
  lendingType: z.enum(['customer', 'go4solar']).optional(),
})

export async function setLeadTick(input: unknown) {
  const a = await actor()
  const p = tickSchema.safeParse(input)
  if (!a || !p.success) return SIGNED_OUT
  const r = await setTick(p.data.waitlistId, p.data, a)
  if (r.ok) revalidatePath(`/admin/waitlist/${p.data.waitlistId}/edit`)
  return r
}

export async function sendToTradeLenda(input: unknown) {
  const a = await actor()
  const p = z
    .object({
      ids: z.array(z.uuid()).min(1).max(200),
      lendingType: z.enum(['customer', 'go4solar']),
    })
    .safeParse(input)
  if (!a) return SIGNED_OUT
  if (!p.success) return { ok: false as const, error: 'Choose at least one entry.' }
  const r = await createBatch(p.data, a)
  if (r.ok) {
    revalidatePath('/admin/waitlist/profiles')
    revalidatePath('/admin/waitlist/batches')
  }
  return r
}

export async function sendUpdatedBatch(batchId: string) {
  const a = await actor()
  if (!a || !z.uuid().safeParse(batchId).success) return SIGNED_OUT
  const r = await updateBatch(batchId, a)
  if (r.ok) revalidatePath('/admin/waitlist/batches')
  return r
}

/** Consent to share with one funder: tick (on) or withdraw (off). Sales may record it too. */
export async function setLeadConsent(input: unknown) {
  const a = await actor()
  const p = z
    .object({
      waitlistId: z.uuid(),
      funderId: z.uuid(),
      on: z.boolean(),
      note: z.string().max(500).nullable().optional(),
    })
    .safeParse(input)
  if (!a || !p.success) return SIGNED_OUT
  const r = await setConsent(p.data, a)
  if (r.ok) {
    revalidatePath(`/admin/waitlist/${p.data.waitlistId}/edit`)
    revalidatePath('/admin/waitlist')
  }
  return r
}

/** "Send by WhatsApp" (records it; the link opens WhatsApp) or "Send by email" (our outbox). */
export async function sendLeadOnboardingLink(input: unknown) {
  const a = await actor()
  const p = z
    .object({ itemId: z.uuid(), channel: z.enum(['whatsapp', 'email']), waitlistId: z.uuid() })
    .safeParse(input)
  if (!a || !p.success) return SIGNED_OUT
  const r = await sendOnboardingLink({ itemId: p.data.itemId, channel: p.data.channel }, a)
  if (r.ok) revalidatePath(`/admin/waitlist/${p.data.waitlistId}/edit`)
  return r
}
