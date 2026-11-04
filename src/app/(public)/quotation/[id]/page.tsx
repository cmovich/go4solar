import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { BrandLogo } from '@/components/brand/BrandLogo'
import { AcceptQuotation } from '@/components/invoices/AcceptQuotation'
import { InvoiceLink } from '@/components/invoices/InvoiceLink'
import { QuotationView } from '@/components/invoices/QuotationView'
import { siteConfig } from '@/config/site'
import { quotationForQuote } from '@/lib/invoices/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentVisitorHash } from '@/lib/waitlist/token'

export const metadata: Metadata = { title: 'Your quotation' }
export const dynamic = 'force-dynamic'

/**
 * Live: after choosing a plan (or Apply in the builder), the full quotation before any identity
 * step. Accept turns it into the numbered invoice and goes on to the account step.
 */
export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hash = await currentVisitorHash()
  if (!z.uuid().safeParse(id).success || !hash) redirect('/get-started')
  const { data: quote } = await createAdminClient()
    .from('quotes')
    .select('id, anon_token_hash, accepted_at')
    .eq('id', id)
    .maybeSingle()
  if (!quote || quote.anon_token_hash !== hash) redirect('/get-started')
  if (quote.accepted_at) redirect(`/account?quote=${quote.id}`)
  const q = await quotationForQuote(quote.id)

  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <BrandLogo onDark priority className="h-12 w-auto" />
          </Link>
          <span className="text-brand-gold text-sm font-semibold">Your quotation</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <h1 className="text-brand-dark text-2xl font-bold tracking-tight">Your quotation</h1>
        <p className="text-muted-foreground text-sm">
          Check everything below. When you accept, this becomes your invoice and we ask for your
          details to set up your payment plan.
        </p>
        {q.ok ? (
          <>
            <QuotationView d={q.invoice} />
            <InvoiceLink href={`/api/quotations/${quote.id}`} testId="quotation-pdf" />
          </>
        ) : (
          <p className="bg-brand-mist rounded-xl p-4 text-sm" data-testid="quotation-later">
            Your exact price will be confirmed when we contact you.
          </p>
        )}
        <AcceptQuotation quoteId={quote.id} />
      </main>
    </>
  )
}
