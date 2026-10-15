import Link from 'next/link'

import { SECTION_TITLES, type PricingSection } from '@/components/admin/pricing/PricingWorkbench'
import { requireRole } from '@/lib/auth/roles'
import { loadPricingDraft } from '@/lib/pricing/adminData'

const SECTIONS: PricingSection[] = [
  'components',
  'margins',
  'rates',
  'installation',
  'unit-costs',
  'late-fee',
  'energy',
]

/** Pricing is super_admin only. The yellow banner stays until no active row is a SAMPLE. */
export default async function PricingLayout({ children }: { children: React.ReactNode }) {
  await requireRole('super_admin')
  const draft = await loadPricingDraft()
  const anySample = Object.values(draft.sample).some(Boolean) || draft.energy.sample
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {anySample && (
        <p
          className="mb-4 rounded-md border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900"
          data-testid="sample-banner"
        >
          Sample prices — replace before launch. Rows marked SAMPLE are placeholders; every quote
          built from them is an estimate.
        </p>
      )}
      <h1 className="text-brand-dark text-3xl font-bold">Pricing</h1>
      <nav className="mt-4 flex flex-wrap gap-1 border-b" aria-label="Pricing sections">
        {SECTIONS.map((s) => (
          <Link
            key={s}
            href={`/admin/pricing/${s}`}
            className="text-muted-foreground hover:text-brand-dark aria-[current=page]:border-brand-green aria-[current=page]:text-brand-dark -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-semibold"
          >
            {SECTION_TITLES[s]}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </main>
  )
}
