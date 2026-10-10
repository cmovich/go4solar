import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { AccountFlow } from '@/components/plans/AccountFlow'
import { siteConfig } from '@/config/site'
import { getSessionInfo } from '@/lib/auth/session'
import { formatNaira } from '@/lib/money'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import { quoteReference } from '@/lib/quotes/quote'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentVisitorHash } from '@/lib/waitlist/token'

export const metadata: Metadata = { title: 'Create your account' }
export const dynamic = 'force-dynamic'

/** "0803 123 4567" from "+2348031234567". */
function localPhone(e164: string): string {
  const local = `0${e164.replace(/^\+234/, '')}`
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
}

/** Account step after "Choose this plan": email/password prefilled from the earlier answers, then the phone code. */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string }>
}) {
  const { quote: quoteId } = await searchParams
  const hash = await currentVisitorHash()
  if (!quoteId || !z.uuid().safeParse(quoteId).success || !hash) redirect('/get-started')

  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('quotes')
    .select('id, waitlist_id, plan, tenure, result, status')
    .eq('id', quoteId)
    .eq('anon_token_hash', hash)
    .maybeSingle()
  if (!quote?.waitlist_id) redirect('/get-started')
  if (quote.status === 'chosen') redirect('/app/apply')
  const { data: lead } = await admin
    .from('waitlist_consumers')
    .select('first_name, email, phone_e164')
    .eq('id', quote.waitlist_id)
    .maybeSingle()
  if (!lead) redirect('/get-started')

  const { user } = await getSessionInfo()
  const result = quote.result as { systemPrice?: number; monthly?: number }

  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <span className="inline-flex rounded-md bg-white px-3 py-1.5">
              <Image
                src="/brand/go4solar-logo.png"
                alt={siteConfig.name}
                width={150}
                height={48}
                priority
                className="h-9 w-auto"
              />
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <h1 className="text-brand-dark text-2xl font-bold tracking-tight sm:text-3xl">
          {user ? 'Confirm your phone' : `Create your account, ${lead.first_name}`}
        </h1>
        <p className="bg-brand-mist mt-3 rounded-lg px-4 py-3 text-sm">
          {PLAN_LABELS[quote.plan as Plan]} plan · {quoteReference(quote.id)} ·{' '}
          {formatNaira(result.monthly ?? 0)} a month for {quote.tenure} months · total{' '}
          {formatNaira(result.systemPrice ?? 0)}
        </p>
        <div className="mt-6">
          <AccountFlow
            quoteId={quote.id}
            defaultEmail={user?.email ?? lead.email ?? ''}
            phoneDisplay={localPhone(lead.phone_e164)}
            signedIn={Boolean(user)}
          />
        </div>
      </main>
    </>
  )
}
