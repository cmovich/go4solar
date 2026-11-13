import type { Metadata } from 'next'

import { ReadyPlansAdmin } from '@/components/admin/pricing/ReadyPlansAdmin'
import { siteMediaUrl } from '@/lib/content/server'
import { NG_STATE_IDS } from '@/lib/nigeria/states'
import { loadReadyPlans } from '@/lib/readyPlans/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Ready-made plans' }
export const dynamic = 'force-dynamic'

/** Super admin (the pricing layout checks): fixed bundles shown on the home page and /plans/<name>. */
export default async function ReadyPlansPage() {
  const { error } = await createAdminClient().from('ready_plans').select('id').limit(1)
  if (error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        Ready-made plans are not set up yet (migration 0034 has not been applied).
      </p>
    )
  }
  const plans = await loadReadyPlans({ activeOnly: false })
  return (
    <ReadyPlansAdmin
      plans={plans.map((p) => ({ ...p, imageUrl: siteMediaUrl(p.image) }))}
      states={[...NG_STATE_IDS]}
    />
  )
}
