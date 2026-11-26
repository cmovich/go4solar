import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import type { Actor } from '@/lib/tradeLenda/server'

import { canVoidBatch, voidNumber, voidReasonSchema } from './void'

type Result = { ok: true; voidNumber: string } | { ok: false; error: string }

/**
 * Void a funder batch (every version of its number), super admin only: renamed to …-VOID-…,
 * hidden from the funder, its people no longer count as exported. Nothing is deleted; one
 * audit row `funder_batch.void` (the database trigger records each row change too).
 */
export async function voidBatch(
  input: { batchId: string; reason: string },
  actor: Actor,
): Promise<Result> {
  if (!canVoidBatch(actor.role)) return { ok: false, error: 'Only a super admin can void a batch.' }
  const reason = voidReasonSchema.safeParse(input.reason)
  if (!reason.success) return { ok: false, error: reason.error.issues[0]!.message }
  const admin = createAdminClient()
  const { data: b } = await admin
    .from('funder_batches')
    .select('id, funder_id, number, voided_at')
    .eq('id', input.batchId)
    .maybeSingle()
  if (!b) return { ok: false, error: 'Batch not found.' }
  if (b.voided_at) return { ok: false, error: 'This batch is already voided.' }
  const { data: same } = await admin
    .from('funder_batches')
    .select('id, number, voided_number')
    .eq('funder_id', b.funder_id)
  const versions = (same ?? []).filter((x) => x.number === b.number).map((x) => x.id)
  const taken = (same ?? []).map((x) => x.number).filter((n) => n.includes('-VOID-'))
  const number = voidNumber(b.number, taken)
  const now = new Date().toISOString()
  const { error } = await admin
    .from('funder_batches')
    .update({
      number,
      voided_number: b.number,
      voided_at: now,
      voided_by: actor.id,
      void_reason: reason.data,
    })
    .in('id', versions)
  if (error) return { ok: false, error: 'Could not void the batch. Nothing was changed.' }
  await admin.from('audit_log').insert({
    actor_id: actor.id,
    action: 'funder_batch.void',
    entity: 'funder_batches',
    entity_id: b.id,
    before: { number: b.number } as Json,
    after: { number, reason: reason.data, versions: versions.length } as Json,
  })
  return { ok: true, voidNumber: number }
}
