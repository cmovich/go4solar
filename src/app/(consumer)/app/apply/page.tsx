import type { Metadata } from 'next'
import Link from 'next/link'

import { requireUser } from '@/lib/auth/roles'
import { formatNaira } from '@/lib/money'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import { quoteReference } from '@/lib/quotes/quote'
import type { Plan } from '@/lib/sizing/types'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Your application' }
export const dynamic = 'force-dynamic'

/** Placeholder until Prompt 10 builds the application wizard. */
export default async function ApplyPage() {
  const { user } = await requireUser('/app/apply')
  const supabase = await createClient()
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, plan, tenure, deposit_share, result, status')
    .eq('owner_id', user!.id)
    .eq('status', 'chosen')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const result = (quote?.result ?? null) as {
    systemPrice?: number
    monthly?: number
    deposit?: number
  } | null

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-brand-green text-sm font-semibold tracking-wide uppercase">
        Phone verified
      </p>
      <h1 className="text-brand-dark mt-2 text-3xl font-bold">Next: verify your identity</h1>
      <p className="text-muted-foreground mt-3">
        Your account is ready. The next step is a quick identity check (NIN, BVN and a face check),
        then your guarantor. This part of the app opens soon.
      </p>
      {quote && result && (
        <div className="bg-brand-mist mt-6 rounded-2xl p-5" data-testid="chosen-quote">
          <p className="text-brand-dark font-semibold">
            {PLAN_LABELS[quote.plan as Plan]} plan · {quoteReference(quote.id)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatNaira(result.deposit ?? 0)} upfront, then {formatNaira(result.monthly ?? 0)} a
            month for {quote.tenure} months. Total amount payable{' '}
            {formatNaira(result.systemPrice ?? 0)} · 0% interest.
          </p>
        </div>
      )}
      <Link href="/" className="text-brand-blue mt-8 inline-block text-sm underline">
        Back to home
      </Link>
    </main>
  )
}
