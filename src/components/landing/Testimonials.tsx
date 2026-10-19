import type { HomeTestimonial } from '@/lib/content/server'

import { Container, SectionHeading } from './Band'
import { TestimonialCarousel } from './TestimonialCarousel'

/** Real customer stories only: the section is left out entirely when none is published. */
export function Testimonials({ items }: { items: HomeTestimonial[] }) {
  if (items.length === 0) return null
  return (
    <section className="bg-brand-mist py-20 sm:py-24" data-testid="testimonials">
      <Container>
        <SectionHeading eyebrow="Customer stories" title="What our customers say" />
        <div className="mt-10">
          <TestimonialCarousel items={items} />
        </div>
      </Container>
    </section>
  )
}
