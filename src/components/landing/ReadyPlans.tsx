import Link from 'next/link'

import { PlanCard } from '@/components/readyPlans/PlanCard'
import type { ReadyPlanOffer } from '@/lib/readyPlans/server'

import { Container, SectionHeading } from './Band'

/**
 * Right after the hero: the ready-made plans, smallest to largest. A swipeable row on phones, a
 * grid on larger screens. Hidden when no plan is switched on.
 */
export function ReadyPlans({
  offers,
  images,
}: {
  offers: ReadyPlanOffer[]
  images: Record<string, string | null>
}) {
  if (offers.length === 0) return null
  return (
    <section id="ready-plans" className="py-16 sm:py-20" data-testid="ready-plans">
      <Container>
        <SectionHeading
          eyebrow="Ready-made plans"
          title="Choose a ready-made solar plan"
          lead="One fixed price. No hidden charges."
        />
        <div
          className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
          aria-label="Ready-made plans"
          data-testid="ready-plans-list"
        >
          {offers.map((o) => (
            <PlanCard key={o.plan.slug} offer={o} imageUrl={images[o.plan.slug] ?? null} />
          ))}
        </div>
        <p className="text-muted-foreground mt-2 text-sm" data-testid="ready-plans-note">
          Prices for {offers[0]!.plan.deliveryState}. Delivery to other states is paid by the
          customer.
        </p>
        <p className="mt-4 text-sm">
          Can&rsquo;t find a plan that fits?{' '}
          <Link href="/calculate" className="text-brand-blue font-semibold underline">
            Calculate my load
          </Link>{' '}
          or{' '}
          <Link href="/build" className="text-brand-blue font-semibold underline">
            build your own system
          </Link>
          .
        </p>
      </Container>
    </section>
  )
}
