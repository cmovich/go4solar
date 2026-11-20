import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

/**
 * An approved loan is cancelled: what was taken off a lending-type funder's (Trade Lenda's)
 * balance goes back, once (loans.drawn is set to 0), audited. Other funders: unchanged.
 */
export async function restoreFunderBalance(applicationId: string, actorId: string | null) {
  const admin = createAdminClient()
  const { data: loan } = await admin
    .from('loans')
    .select('id, funder_id, drawn, lending_type')
    .eq('application_id', applicationId)
    .maybeSingle()
  const amount = Number(loan?.drawn ?? 0)
  if (!loan?.funder_id || !loan.lending_type || amount <= 0) return
  // Claim it first so a repeat never gives the money back twice.
  const { data: claimed } = await admin
    .from('loans')
    .update({ drawn: 0 })
    .eq('id', loan.id)
    .eq('drawn', amount)
    .select('id')
  if (!claimed?.length) return
  const { data: balanceAfter } = await admin.rpc('draw_from_funder', {
    p_funder: loan.funder_id,
    p_amount: -amount,
  })
  await admin.from('audit_log').insert({
    actor_id: actorId,
    action: 'funder.balance_restore',
    entity: 'loans',
    entity_id: loan.id,
    before: { drawn: amount } as Json,
    after: { drawn: 0, funderId: loan.funder_id, balanceAfter } as Json,
  })
}
