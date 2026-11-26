'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getSessionInfo } from '@/lib/auth/session'
import { voidBatch } from '@/lib/exports/voidServer'
import {
  addToQueue,
  discardQueue,
  exportQueue,
  removeFromQueue,
  updateExportBatch,
} from '@/lib/exports/queue'
import type { Actor } from '@/lib/tradeLenda/server'

async function actor(): Promise<Actor | null> {
  const s = await getSessionInfo()
  return s.user && s.aal === 'aal2' ? { id: s.user.id, role: s.role } : null
}
const SIGNED_OUT = { ok: false as const, error: 'Please sign in again.' }

function refresh() {
  revalidatePath('/admin/exports')
  revalidatePath('/admin/exports/queue')
  revalidatePath('/admin/waitlist')
}

/** Waiting list → "Add to export queue" (both tabs, super admin and Operations). */
export async function addToExportQueue(input: unknown) {
  const a = await actor()
  const p = z.object({ ids: z.array(z.uuid()).min(1).max(500) }).safeParse(input)
  if (!a) return SIGNED_OUT
  if (!p.success) return { ok: false as const, error: 'Choose at least one person.' }
  const r = await addToQueue(p.data.ids, a)
  if (r.ok) refresh()
  return r
}

export async function removeFromExportQueue(input: unknown) {
  const a = await actor()
  const p = z.object({ queueId: z.uuid(), waitlistId: z.uuid() }).safeParse(input)
  if (!a || !p.success) return SIGNED_OUT
  const r = await removeFromQueue(p.data, a)
  if (r.ok) refresh()
  return r
}

export async function exportTheQueue(input: unknown) {
  const a = await actor()
  const p = z
    .object({
      isTest: z.boolean(),
      funderId: z.uuid(),
      lendingType: z.enum(['customer', 'go4solar']),
      mode: z.enum(['basic', 'full-where-possible']),
    })
    .safeParse(input)
  if (!a) return SIGNED_OUT
  if (!p.success) return { ok: false as const, error: 'Choose the funder and how to export.' }
  const r = await exportQueue(p.data, a)
  if (r.ok) {
    refresh()
    revalidatePath('/admin/funder')
  }
  return r
}

/** Admin → Exports: "Send updated version" for any funder's batch. */
export async function sendUpdatedVersion(input: unknown) {
  const a = await actor()
  const p = z.object({ batchId: z.uuid() }).safeParse(input)
  if (!a || !p.success) return SIGNED_OUT
  const r = await updateExportBatch(p.data.batchId, a)
  if (r.ok) {
    refresh()
    revalidatePath('/admin/funder')
  }
  return r
}

/** Discard the open queue (nothing exported, no batch number used). */
export async function discardExportQueue(input: unknown) {
  const a = await actor()
  const p = z.object({ queueId: z.uuid() }).safeParse(input)
  if (!a || !p.success) return SIGNED_OUT
  const r = await discardQueue(p.data.queueId, a)
  if (r.ok) refresh()
  return r
}

/** Admin → Exports: "Void batch" (super admin; reason required; audited). */
export async function voidExportBatch(input: unknown) {
  const a = await actor()
  const p = z.object({ batchId: z.uuid(), reason: z.string().max(500) }).safeParse(input)
  if (!a || !p.success) return SIGNED_OUT
  const r = await voidBatch(p.data, a)
  if (r.ok) {
    refresh()
    revalidatePath('/admin/funder')
  }
  return r
}
