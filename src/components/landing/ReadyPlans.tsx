import Link from 'next/link'

import { PlanCard } from '@/components/readyPlans/PlanCard'
import type { ReadyPlanOffer } from '@/lib/readyPlans/server'

import { Container, SectionHeading } from './Band'
import { SeeMorePlans } from './SeeMorePlans'

/**
 * Right after the hero: the ready-made plans ticked "Show on home page" (in order), the other
 * switched-on plans behind "See more plans". A swipeable row on phones, a grid on larger
 * screens. Hidden when no plan is switched on.
 */
export function ReadyPlans({
  shown,
  more,
  images,
}: {
  shown: ReadyPlanOffer[]
  more: ReadyPlanOffer[]
  images: Record<string, string | null>
}) {
  const first = shown[0] ?? more[0]
  if (!first) return null
  const card = (o: ReadyPlanOffer) => (
    <PlanCard key={o.plan.slug} offer={o} imageUrl={images[o.plan.slug] ?? null} />
  )
  return (
    <section id="ready-plans" className="py-16 sm:py-20" data-testid="ready-plans">
      <Container>
        <SectionHeading
          eyebrow="Ready-made plans"
          title="Choose a ready-made solar plan"
          lead="One fixed price. No hidden charges."
        />
        <SeeMorePlans shown={shown.map(card)} more={more.map(card)} moreCount={more.length} />
        <p className="text-muted-foreground mt-2 text-sm" data-testid="ready-plans-note">
          Prices for {first.plan.deliveryState}. Delivery to other states is paid by the customer.
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
