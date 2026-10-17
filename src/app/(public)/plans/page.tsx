import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PlansChooser } from '@/components/plans/PlansChooser'
import { siteConfig } from '@/config/site'
import { loadLeadForPlans } from '@/lib/quotes/leadForPlans'
import { quoteReference, validUntil } from '@/lib/quotes/quote'

export const metadata: Metadata = { title: 'Your solar plans' }
export const dynamic = 'force-dynamic'

/**
 * Live mode: the three priced plans for the details the visitor already gave in /get-started.
 * Loads that record by id + the visitor cookie, so nothing is asked twice.
 */
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ estimate?: string }>
}) {
  const { estimate: id } = await searchParams
  const ctx = id ? await loadLeadForPlans(id) : null
  if (!ctx) redirect('/get-started')

  const until = validUntil(new Date(), ctx.validityDays).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'long',
  })

  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
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
          <span className="text-brand-gold text-sm font-semibold">Your solar plans</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-brand-dark text-2xl font-bold tracking-tight sm:text-3xl">
          Here are your plans, {ctx.lead.first_name}
        </h1>
        <p className="text-muted-foreground mt-2 text-base">
          Choose how much to pay upfront and over how many months. Every plan is one fixed price
          with 0% interest.
        </p>
        {ctx.estimate.sample && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Sample prices: your final quote is confirmed before you sign.
          </p>
        )}
        <div className="mt-6">
          <PlansChooser
            leadId={ctx.lead.id}
            firstName={ctx.lead.first_name ?? ''}
            estimate={ctx.estimate}
            current={ctx.energy?.current ?? null}
            validUntilLabel={until}
            reference={quoteReference(ctx.lead.id)}
            whatsappNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? ''}
            fallbackNumber={siteConfig.phones[0]}
            tenures={ctx.tenures}
          />
        </div>
      </main>
    </>
  )
}
