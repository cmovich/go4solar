import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { BrandLogo } from '@/components/brand/BrandLogo'
import { ReadyPlanStart } from '@/components/readyPlans/ReadyPlanStart'
import { siteConfig } from '@/config/site'
import { isNgStateId } from '@/lib/nigeria/states'
import { loadReadyPlan } from '@/lib/readyPlans/server'
import { fetchRoofTypes } from '@/lib/wizard/server'

export const metadata: Metadata = { title: 'Your ready-made plan', robots: { index: false } }
export const dynamic = 'force-dynamic'

/**
 * "Choose this plan": where the panels go (installation notes only — the price stays fixed), then
 * "Your quotation", then Accept and apply.
 */
export default async function ReadyPlanStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ months?: string; state?: string }>
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const plan = await loadReadyPlan(slug)
  if (!plan) notFound()
  const months = Number(sp.months)
  const state = sp.state ?? plan.deliveryState
  if (!plan.tenures.includes(months) || !isNgStateId(state)) redirect(`/plans/${slug}`)
  const roofTypes = await fetchRoofTypes()
  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <BrandLogo onDark priority className="h-12 w-auto" />
          </Link>
          <span className="text-brand-gold text-sm font-semibold">{plan.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ReadyPlanStart
          slug={plan.slug}
          planName={plan.name}
          months={months}
          state={state}
          roofTypes={roofTypes}
        />
      </main>
    </>
  )
}
