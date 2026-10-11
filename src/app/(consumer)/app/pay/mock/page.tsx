import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { MockCheckout } from '@/components/payments/MockProviderPages'
import { siteOrigin } from '@/lib/auth/emailVerification'
import { requireUser } from '@/lib/auth/roles'
import { formatNaira } from '@/lib/money'
import { paymentsMode } from '@/lib/providers/payments'
import { createAdminClient } from '@/lib/supabase/admin'

import { safeNext } from '../safeNext'

export const dynamic = 'force-dynamic'

/** Mock checkout (PAYMENTS_PROVIDER=mock only). */
export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; next?: string }>
}) {
  if (paymentsMode() !== 'mock') notFound()
  const { user } = await requireUser('/app')
  const sp = await searchParams
  const { data: row } = await createAdminClient()
    .from('payments')
    .select('reference, amount, consumer_id, status')
    .eq('reference', sp.reference ?? '')
    .maybeSingle()
  if (!row || row.consumer_id !== user!.id || row.status !== 'pending') notFound()
  const next = safeNext(sp.next, siteOrigin(await headers()), '/app')
  return (
    <MockCheckout reference={row.reference} amount={formatNaira(Number(row.amount))} next={next} />
  )
}
