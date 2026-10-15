import Link from 'next/link'

import { Band, Container, SectionHeading } from './Band'

const cta =
  'inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark focus-visible:outline-none'

/** `vendors`: the vendor sign-up opens at launch, so its button is hidden in prelaunch. */
export function Partners({ vendors }: { vendors: boolean }) {
  return (
    <Band angled accent className="py-20 sm:py-28">
      <Container>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <SectionHeading
            light
            eyebrow="For installers and vendors"
            title="Grow with Go4Solar"
            lead="We bring you verified customers who have already paid a deposit. You bring genuine equipment and quality installations. Everyone gets paid on time."
          />
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Link
              href="/partners/installer"
              prefetch={false}
              className={`${cta} bg-brand-orange hover:bg-brand-orange/90 text-brand-dark`}
            >
              Become a partner installer
            </Link>
            {vendors && (
              <Link
                href="/partners/vendor"
                prefetch={false}
                className={`${cta} border border-white/40 text-white hover:bg-white/10`}
              >
                Become a verified vendor
              </Link>
            )}
          </div>
        </div>
      </Container>
    </Band>
  )
}
