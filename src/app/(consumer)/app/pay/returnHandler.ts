import 'server-only'

import { NextResponse } from 'next/server'

import { getSessionInfo } from '@/lib/auth/session'
import { confirmCheckout } from '@/lib/payments/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Back from checkout: the browser's arrival proves nothing, so ask the provider (verify) and apply
 * the result through the same idempotent path as the webhook, then show the right page.
 */
export async function checkoutReturn(req: Request, done: string, retry: string) {
  const url = new URL(req.url)
  const reference = url.searchParams.get('reference') ?? url.searchParams.get('trxref') ?? ''
  const session = await getSessionInfo()
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin), 303)
  if (!session.user) return to(`/login?next=${encodeURIComponent(retry)}`)
  const { data: row } = await createAdminClient()
    .from('payments')
    .select('consumer_id')
    .eq('reference', reference)
    .maybeSingle()
  if (!row || row.consumer_id !== session.user.id) return to(retry)
  let outcome: string
  try {
    outcome = await confirmCheckout(reference)
  } catch {
    outcome = 'pending' // provider unreachable: the webhook will still arrive
  }
  if (outcome === 'applied' || outcome === 'duplicate') return to(done)
  return to(`${retry}?payment=${outcome === 'pending' ? 'pending' : 'failed'}`)
}
