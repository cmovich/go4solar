import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { StaffQuotationForm } from '@/components/quotations/StaffQuotationForm'
import { launchMode } from '@/config/site'
import { fetchApplianceLibrary } from '@/lib/appliances/library'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { builderContext, builderItems } from '@/lib/build/server'
import { mayCreateQuotations } from '@/lib/staffQuotes/server'
import { fetchRoofTypes, fetchWiring } from '@/lib/wizard/server'

export const metadata: Metadata = { title: 'New quotation' }
export const dynamic = 'force-dynamic'

/** A quotation for a customer, made with the system builder. No account or sign-up needed. */
export default async function NewQuotationPage() {
  const session = await requireStaffWithMfa()
  if (!(await mayCreateQuotations(session))) redirect('/admin')
  const [ctx, roofTypes, wiring, library] = await Promise.all([
    builderContext(),
    fetchRoofTypes(),
    fetchWiring(),
    fetchApplianceLibrary(),
  ])
  const sample = ctx.settings.priceList.sample || ctx.settings.pricing.sample
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/admin/quotations" className="text-brand-blue text-sm underline">
        ‹ Quotations
      </Link>
      <h1 className="text-brand-dark mt-2 text-3xl font-bold">New quotation</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Build the system with the customer, then create the quotation and share it on WhatsApp.
        {sample && ' Prices are still SAMPLE: the quotation shows the system only, no amounts.'}
      </p>
      <StaffQuotationForm
        items={builderItems(ctx)}
        roofTypes={roofTypes}
        wiring={wiring}
        library={library}
        launchMode={launchMode()}
        showPrices={!sample}
      />
    </main>
  )
}
