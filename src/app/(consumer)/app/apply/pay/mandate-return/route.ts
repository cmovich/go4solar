import { NextResponse } from 'next/server'

import { getSessionInfo } from '@/lib/auth/session'
import { confirmMandate } from '@/lib/payments/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Back from the bank's auto-pay approval: verify with the provider, then the dashboard. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const reference = url.searchParams.get('ref') ?? ''
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin), 303)
  const session = await getSessionInfo()
  if (!session.user) return to('/login?next=/app')
  const { data: m } = await createAdminClient()
    .from('mandates')
    .select('consumer_id')
    .eq('init_reference', reference)
    .maybeSingle()
  if (!m || m.consumer_id !== session.user.id) return to('/app')
  let outcome: string
  try {
    outcome = await confirmMandate(reference)
  } catch {
    outcome = 'pending'
  }
  return to(`/app?autopay=${outcome === 'pending' ? 'pending' : 'checked'}`)
}
