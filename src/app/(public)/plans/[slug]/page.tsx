import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BrandLogo } from '@/components/brand/BrandLogo'
import { PlanTags } from '@/components/readyPlans/PlanCard'
import { ReadyPlanChooser } from '@/components/readyPlans/ReadyPlanChooser'
import { siteConfig } from '@/config/site'
import { siteMediaUrl } from '@/lib/content/server'
import { NG_STATE_IDS } from '@/lib/nigeria/states'
import { loadDeliveryRows, loadReadyPlan, offerFor } from '@/lib/readyPlans/server'

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const plan = await loadReadyPlan((await params).slug)
  // Here, before the page starts streaming, so a missing plan answers with a real 404.
  if (!plan) notFound()
  return { title: `${plan.name} — ready-made solar plan`, description: plan.summary }
}

/** A ready-made plan: what is included, what it powers, and its fixed price per length. */
export default async function ReadyPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [plan, rows] = await Promise.all([loadReadyPlan(slug), loadDeliveryRows()])
  if (!plan) notFound()
  const offer = offerFor(plan, rows)
  const p = offer.plan
  const image = siteMediaUrl(plan.image)
  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <BrandLogo onDark priority className="h-12 w-auto" />
          </Link>
          <Link href="/#ready-plans" className="text-brand-gold text-sm font-semibold">
            All plans
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-[4/3] w-full rounded-2xl object-cover sm:mx-auto sm:max-w-xl"
            width={800}
            height={600}
          />
        )}
        <div className="space-y-2">
          <PlanTags voltage={p.systemVoltage} tag={p.tag} />
          <h1 className="text-brand-dark text-3xl font-bold tracking-tight">{p.name}</h1>
          <p className="text-muted-foreground">{p.summary}</p>
          {p.tagline && <p className="text-lg">{p.tagline}</p>}
        </div>

        <section>
          <h2 className="text-brand-dark text-lg font-bold">What&rsquo;s included</h2>
          <ul className="mt-2 divide-y rounded-xl border text-sm" data-testid="plan-included">
            {p.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 px-3 py-2">
                <span>
                  {l.name}
                  {l.spec && <span className="text-muted-foreground"> · {l.spec}</span>}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">× {l.qty}</span>
              </li>
            ))}
          </ul>
        </section>

        {p.canPower.length > 0 && (
          <section>
            <h2 className="text-brand-dark text-lg font-bold">Can power</h2>
            <ul className="mt-2 list-disc pl-5 text-sm" data-testid="plan-can-power">
              {p.canPower.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        )}

        {p.backup.length > 0 && (
          <section>
            <h2 className="text-brand-dark text-lg font-bold">Backup</h2>
            <ul className="mt-2 list-disc pl-5 text-sm" data-testid="plan-backup">
              {p.backup.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-1 text-xs">
              Estimates — depends on how many items are on at once.
            </p>
          </section>
        )}

        <ReadyPlanChooser offer={offer} states={[...NG_STATE_IDS]} />

        <section>
          <h2 className="text-brand-dark text-lg font-bold">Good to know</h2>
          <ul className="text-muted-foreground mt-2 list-disc pl-5 text-sm">
            <li>You provide a ladder or scaffold where one is needed.</li>
            <li>Subject to a site check.</li>
          </ul>
        </section>
      </main>
    </>
  )
}
