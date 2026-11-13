import type { Metadata } from 'next'
import Link from 'next/link'
import { z } from 'zod'

import { BrandLogo } from '@/components/brand/BrandLogo'
import { BuildQuotation } from '@/components/build/BuildQuotation'
import { Builder } from '@/components/build/Builder'
import { launchMode, siteConfig } from '@/config/site'
import { builderContext, builderItems } from '@/lib/build/server'
import type { BuilderState } from '@/lib/build/store'
import { isNgStateId } from '@/lib/nigeria/states'
import { loadReadyPlan } from '@/lib/readyPlans/server'
import { PLAN_LABELS, type Estimate } from '@/lib/quotes/buildEstimate'
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
  searchParams: Promise<{
    lead?: string
    plan?: string
    done?: string
    load?: string
    quotation?: string
    ready?: string
    state?: string
  }>
}) {
  const sp = await searchParams
  const [ctx, roofTypes, wiring] = await Promise.all([
    builderContext(),
    fetchRoofTypes(),
    fetchWiring(),
  ])
  // "Customise this plan" from a ready-made plan: its state, and its size as the starting load.
  const readyPlan = !sp.lead && sp.ready ? await loadReadyPlan(sp.ready) : null
  const readyState =
    readyPlan && sp.state && isNgStateId(sp.state) ? sp.state : (readyPlan?.deliveryState ?? null)
  const initial =
    sp.lead && sp.plan
      ? await adjustFrom(sp.lead, sp.plan)
      : readyPlan && readyState && isNgStateId(readyState)
        ? {
            scope: 'complete' as const,
            state: readyState,
            items: readyPlan.lines
              .filter((l) => l.sku)
              // Items no longer sold are dropped by the builder itself (sanitiseBuilderState).
              .map((l) => ({ sku: l.sku!, qty: l.qty })),
            site: {},
            installer: 'go4solar' as const,
          }
        : null
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
        {sp.quotation && z.uuid().safeParse(sp.quotation).success ? (
          <BuildQuotation leadId={sp.quotation} />
        ) : (
          <Builder
            items={builderItems(ctx)}
            roofTypes={roofTypes}
            wiring={wiring}
            launchMode={launchMode()}
            showPrices={!sample}
            initial={initial}
            adjust={
              initial &&
              sp.lead &&
              (sp.plan === 'essential' || sp.plan === 'comfort' || sp.plan === 'independence')
                ? { leadId: sp.lead, plan: sp.plan, planLabel: PLAN_LABELS[sp.plan] }
                : null
            }
            done={sp.done === '1'}
            applyCalculatedLoad={sp.load === 'calculated'}
            startLoadKva={readyPlan?.inverterKva ?? null}
          />
        )}
      </main>
    </>
  )
}
