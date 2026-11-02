import Link from 'next/link'

import { SECTION_TITLES, type PricingSection } from '@/components/admin/pricing/PricingWorkbench'
import { SampleBanner } from '@/components/admin/pricing/SampleBanner'
import { requireRole } from '@/lib/auth/roles'
import { loadSampleItems } from '@/lib/pricing/sampleServer'

const SECTIONS: PricingSection[] = [
  'components',
  'margins',
  'rates',
  'installation',
  'unit-costs',
  'late-fee',
  'energy',
]

/** Pricing is super_admin only. The banner lists every SAMPLE row until all are confirmed. */
export default async function PricingLayout({ children }: { children: React.ReactNode }) {
  await requireRole('super_admin')
  const items = await loadSampleItems()
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SampleBanner items={items} />
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
        <Link
          href="/admin/pricing/builder"
          className="text-muted-foreground hover:text-brand-dark -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-semibold"
        >
          Builder
        </Link>
      </nav>
      <div className="mt-6">{children}</div>
    </main>
  )
}
