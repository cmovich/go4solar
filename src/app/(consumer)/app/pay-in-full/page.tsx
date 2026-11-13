import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { PayInFullForm } from '@/components/payInFull/PayInFullForm'
import { ensureApplication, paysInFull } from '@/lib/applications/server'
import { requireUser } from '@/lib/auth/roles'
import { storedBuild } from '@/lib/build/stored'
import { formatNaira, formatPercent } from '@/lib/money'
import { NG_STATE_IDS } from '@/lib/nigeria/states'
import type { QuoteResult } from '@/lib/pricing/types'
import { quoteReference } from '@/lib/quotes/quote'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Pay in full' }
export const dynamic = 'force-dynamic'

/**
 * A ready-made plan paid in full: no ID checks, guarantor or agreement (nothing is financed).
 * The customer confirms the installation address and pays once; we then schedule installation.
 */
export default async function PayInFullPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>
}) {
  const { user } = await requireUser('/app/pay-in-full')
  const app = await ensureApplication(user!.id)
  if (!app) redirect('/get-started')
  if (app.status !== 'draft') redirect('/app')
  if (!(await paysInFull(app))) redirect('/app/apply')
  const { data: quote } = await createAdminClient()
    .from('quotes')
    .select('*')
    .eq('id', app.quote_id!)
    .single()
  if (!quote) redirect('/app')
  const stored = storedBuild('builder' in quote ? quote.builder : null)
  const result = quote.result as unknown as QuoteResult
  const address = (app.install_address ?? {}) as Record<string, string>
  const personal = (app.personal ?? {}) as { state?: string }
  const sp = await searchParams
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-2xl font-bold tracking-tight">Pay in full</h1>
      {sp.payment === 'failed' && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          The payment did not go through. Nothing was taken; please try again.
        </p>
      )}
      {sp.payment === 'pending' && (
        <p className="bg-brand-mist rounded-xl p-3 text-sm" role="status">
          Your payment is still being confirmed. This page updates once it has gone through.
        </p>
      )}
      <section
        className="bg-brand-mist space-y-1 rounded-2xl p-4 text-sm"
        data-testid="pif-summary"
      >
        <p className="text-brand-dark text-lg font-bold">{stored?.title ?? 'Your plan'}</p>
        <p className="text-muted-foreground">Quote {quoteReference(quote.id)}</p>
        {stored?.fixed?.extra && (
          <p className="flex justify-between gap-3">
            <span>Includes delivery to {stored.fixed.extra.state} (extra)</span>
            <strong>{formatNaira(stored.fixed.extra.amount)}</strong>
          </p>
        )}
        <p className="flex justify-between gap-3 pt-2 text-base">
          <span className="font-semibold">Total amount payable</span>
          <strong className="text-brand-green" data-testid="pif-total">
            {formatNaira(result.systemPrice)}
          </strong>
        </p>
        {stored?.fixed && (
          <p>
            One payment ({formatPercent(stored.fixed.fullDiscount, 0)} off the 12-month price). No
            monthly payments, no ID checks or guarantor needed.
          </p>
        )}
        <p className="text-muted-foreground">One fixed price. No hidden charges.</p>
      </section>
      <PayInFullForm
        amount={result.systemPrice}
        states={[...NG_STATE_IDS]}
        initial={{
          line1: address.line1 ?? '',
          city: address.city ?? '',
          state: address.state ?? stored?.fixed?.extra?.state ?? personal.state ?? 'Kaduna',
          lga: address.lga ?? '',
        }}
      />
    </main>
  )
}
