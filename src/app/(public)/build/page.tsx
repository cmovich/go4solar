import type { Metadata } from 'next'
import Link from 'next/link'
import { z } from 'zod'

import { BrandLogo } from '@/components/brand/BrandLogo'
import { Builder } from '@/components/build/Builder'
import { launchMode, siteConfig } from '@/config/site'
import { builderContext, builderItems } from '@/lib/build/server'
import type { BuilderState } from '@/lib/build/store'
import { isNgStateId } from '@/lib/nigeria/states'
import type { Estimate } from '@/lib/quotes/buildEstimate'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentVisitorHash } from '@/lib/waitlist/token'
import { siteAnswersSchema } from '@/lib/wizard/questions'
import { fetchRoofTypes, fetchWiring } from '@/lib/wizard/server'

export const metadata: Metadata = {
  title: 'Build your system',
  description:
    'Choose your inverter, battery, panels and accessories, and see the monthly payment.',
}
export const dynamic = 'force-dynamic'

/**
 * "Adjust this quote": the visitor's own lead (cookie), one of its plans, as the builder's
 * starting items and answers.
 */
async function adjustFrom(leadId: string, plan: string): Promise<Partial<BuilderState> | null> {
  if (!z.uuid().safeParse(leadId).success) return null
  if (!['essential', 'comfort', 'independence'].includes(plan)) return null
  const hash = await currentVisitorHash()
  if (!hash) return null
  const { data: lead } = await createAdminClient()
    .from('waitlist_consumers')
    .select('estimate, state, site')
    .eq('id', leadId)
    .eq('visitor_token_hash', hash)
    .maybeSingle()
  const est = lead?.estimate as Estimate | null
  if (!lead || !est || !lead.state || !isNgStateId(lead.state)) return null
  const lines = est.plans[plan as Plan]?.quote.snapshot.lines ?? []
  return {
    scope: 'complete',
    state: lead.state,
    items: lines.map((l) => ({ sku: l.sku, qty: l.qty })).filter((l) => !l.sku.startsWith('RACK-')),
    site: siteAnswersSchema.safeParse(lead.site ?? {}).data ?? {},
    installer: 'go4solar',
  }
}

export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; plan?: string; done?: string }>
}) {
  const sp = await searchParams
  const [ctx, roofTypes, wiring] = await Promise.all([
    builderContext(),
    fetchRoofTypes(),
    fetchWiring(),
  ])
  const initial = sp.lead && sp.plan ? await adjustFrom(sp.lead, sp.plan) : null
  const sample = ctx.settings.priceList.sample || ctx.settings.pricing.sample
  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <BrandLogo onDark priority className="h-12 w-auto" />
          </Link>
          <span className="text-brand-gold text-sm font-semibold">Build your system</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Builder
          items={builderItems(ctx)}
          roofTypes={roofTypes}
          wiring={wiring}
          launchMode={launchMode()}
          showPrices={!sample}
          initial={initial}
          done={sp.done === '1'}
        />
      </main>
    </>
  )
}
