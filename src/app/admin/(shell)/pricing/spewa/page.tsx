import type { Metadata } from 'next'

import { SpewaPriceListAdmin } from '@/components/admin/pricing/SpewaPriceListAdmin'
import { termsToForm } from '@/lib/spewa/adminSchemas'
import { itemFlags } from '@/lib/spewa/priceList'
import { loadOfferTerms, loadSpewaItems } from '@/lib/spewa/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'SPEWA price list' }
export const dynamic = 'force-dynamic'

/**
 * Super admin (the pricing layout checks): SPEWA's price list for the business offer, which
 * column is the partner price and which the selling price, and the offer terms.
 */
export default async function SpewaPriceListPage() {
  const { error } = await createAdminClient().from('spewa_price_items').select('id').limit(1)
  if (error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        The SPEWA price list is not set up yet (migration 0039 has not been applied).
      </p>
    )
  }
  const [items, terms] = await Promise.all([loadSpewaItems(), loadOfferTerms()])
  return (
    <SpewaPriceListAdmin
      items={items.map((i) => ({ ...i, flags: itemFlags(i, terms) }))}
      terms={termsToForm(terms)}
    />
  )
}
