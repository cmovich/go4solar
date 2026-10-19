import { Container, SectionHeading } from './Band'

// Track record. Add testimonials here later (with written permission) without changing the layout.
const stats = [
  { value: '20+', label: 'homes and businesses financed' },
  { value: '₦30M+', label: 'in solar financing' },
  { value: '₦300M+', label: 'worth of installations' },
  { value: '~1 MW', label: 'installed' },
]

export function Proof() {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Track record"
          title="20+ homes and businesses already financed"
          lead="About 1 MW of solar installed across Nigeria, with genuine equipment and verified installers."
        />
        <dl className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-brand-mist rounded-xl p-5 sm:p-6">
              <dd className="text-brand-dark text-3xl font-bold tracking-tight sm:text-5xl">
                {s.value}
              </dd>
              <dt className="text-muted-foreground mt-2 text-sm sm:text-base">{s.label}</dt>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  )
}
