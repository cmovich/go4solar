import type { Metadata } from 'next'
import Link from 'next/link'

import { BrandLogo } from '@/components/brand/BrandLogo'
import { siteConfig } from '@/config/site'
import { loadCompany } from '@/lib/company/server'
import { verifyView } from '@/lib/invoices/verify'
import { formatNaira } from '@/lib/money'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: 'Check an invoice',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * Printed on every invoice (link and QR code): says whether an invoice is genuine, with its
 * number, date and total and the customer's first name only. Open in both launch modes.
 */
export default async function VerifyInvoicePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const valid = /^[a-z0-9]{10,16}$/.test(code)
  const [company, found] = await Promise.all([
    loadCompany(),
    valid
      ? createAdminClient()
          .from('invoices')
          .select('number, first_name, total, issued_at, valid_until')
          .eq('public_code', code)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const v = verifyView(found.data ?? null)

  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <BrandLogo onDark priority className="h-12 w-auto" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <h1 className="text-brand-dark text-2xl font-bold tracking-tight">Check an invoice</h1>
        {v.status === 'genuine' ? (
          <section
            className="border-brand-green mt-6 rounded-2xl border-2 p-5"
            data-testid="verify-genuine"
          >
            <p className="text-brand-green text-lg font-bold">
              ✓ This is a genuine {company.name} invoice.
            </p>
            <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Invoice</dt>
              <dd className="font-semibold">{v.number}</dd>
              <dt className="text-muted-foreground">Issued</dt>
              <dd className="font-semibold">{v.issuedOn}</dd>
              <dt className="text-muted-foreground">For</dt>
              <dd className="font-semibold">{v.firstName ?? '—'}</dd>
              <dt className="text-muted-foreground">Total amount payable</dt>
              <dd className="font-semibold" data-testid="verify-total">
                {formatNaira(v.total)}
              </dd>
              <dt className="text-muted-foreground">Prices valid until</dt>
              <dd className="font-semibold">
                {v.validUntil}
                {v.expired && ' (expired: ask us for a new invoice)'}
              </dd>
            </dl>
          </section>
        ) : (
          <section
            className="mt-6 rounded-2xl border-2 border-red-300 bg-red-50 p-5"
            data-testid="verify-not-found"
          >
            <p className="text-lg font-bold text-red-800">We could not find this invoice.</p>
            <p className="mt-2 text-sm">
              Check the link or code on the invoice. If it still does not show, contact us before
              paying: {company.email} · {company.phone}.
            </p>
          </section>
        )}
      </main>
    </>
  )
}
