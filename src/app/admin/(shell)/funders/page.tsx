import type { Metadata } from 'next'

import { FundersTable, type FunderRowView } from '@/components/admin/funders/FundersTable'
import { requireRole } from '@/lib/auth/roles'
import { loadPricingDraft } from '@/lib/pricing/adminData'

export const metadata: Metadata = { title: 'Funders' }

/** super_admin edits; finance views. Loan book totals arrive once loans exist (Prompts 12–13). */
export default async function FundersPage() {
  const session = await requireRole('super_admin', 'finance')
  const draft = await loadPricingDraft()
  const rows: FunderRowView[] = draft.funders.map((f) => ({
    ...f,
    book: { drawn: 0, repaid: 0, outstanding: 0, loans: 0 },
  }))
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Funders</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Who lends to Go4Solar and on what terms. The approving admin picks one per loan.
      </p>
      <FundersTable rows={rows} canEdit={session.role === 'super_admin'} />
    </main>
  )
}
