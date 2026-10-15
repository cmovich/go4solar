import type { Metadata } from 'next'

import { PricingWorkbench, SECTION_TITLES } from '@/components/admin/pricing/PricingWorkbench'
import { loadPricingDraft } from '@/lib/pricing/adminData'

export const metadata: Metadata = { title: SECTION_TITLES['unit-costs'] }

export default async function Page() {
  const draft = await loadPricingDraft()
  return <PricingWorkbench section="unit-costs" initial={draft} />
}
