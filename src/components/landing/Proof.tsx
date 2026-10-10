import { Container, SectionHeading } from './Band'

const placeholders = [
  { place: 'Abuja (FCT)', kind: 'Family home' },
  { place: 'Kaduna', kind: 'Small business' },
  { place: 'Lagos', kind: 'Family home' },
]

/** No invented quotes: real customer stories go here once written permission is in hand. */
export function Proof() {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Proof"
          title="20+ homes and businesses already financed"
          lead="About 1 MW of solar installed across Abuja, Kaduna and Lagos, with genuine equipment and verified installers."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {placeholders.map((p) => (
            <article
              key={p.place}
              className="bg-brand-mist border-brand-green/40 flex min-h-44 flex-col justify-between rounded-xl border border-dashed p-6"
            >
              <p className="text-brand-green text-sm font-semibold">Customer stories coming soon</p>
              <div>
                <p className="text-brand-dark font-semibold">{p.kind}</p>
                <p className="text-muted-foreground text-sm">{p.place}</p>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}
