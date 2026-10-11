import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { MockMandate } from '@/components/payments/MockProviderPages'
import { siteOrigin } from '@/lib/auth/emailVerification'
import { requireUser } from '@/lib/auth/roles'
import { paymentsMode } from '@/lib/providers/payments'
import { createAdminClient } from '@/lib/supabase/admin'

import { safeNext } from '../safeNext'

export const dynamic = 'force-dynamic'

/** Mock bank approval for auto-pay (PAYMENTS_PROVIDER=mock only). */
export default async function MockMandatePage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; next?: string }>
}) {
  if (paymentsMode() !== 'mock') notFound()
  const { user } = await requireUser('/app')
  const sp = await searchParams
  const { data: m } = await createAdminClient()
    .from('mandates')
    .select('init_reference, consumer_id, status')
    .eq('init_reference', sp.reference ?? '')
    .maybeSingle()
  if (!m || m.consumer_id !== user!.id || m.status !== 'pending') notFound()
  return (
    <MockMandate
      reference={m.init_reference}
      next={safeNext(sp.next, siteOrigin(await headers()), '/app')}
    />
  )
}
