import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { CompanyForm } from '@/components/admin/CompanyForm'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { loadCompany } from '@/lib/company/server'
import { quoteValidityDays } from '@/lib/quotes/leadForPlans'

export const metadata: Metadata = { title: 'Company details' }
export const dynamic = 'force-dynamic'

/** Super admin: the company details printed on invoices, and how long quotes stay valid. */
export default async function CompanyPage() {
  const session = await requireStaffWithMfa()
  if (session.role !== 'super_admin') redirect('/admin')
  const [company, days] = await Promise.all([loadCompany(), quoteValidityDays()])
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Company details</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Printed at the top of every invoice. Invoices already issued keep the details they were
        issued with. Every change is recorded in the audit log.
      </p>
      <CompanyForm
        initial={{ ...company, rcNumber: company.rcNumber ?? '', quoteValidityDays: days }}
      />
    </main>
  )
}
