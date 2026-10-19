import Image from 'next/image'

import type { HomePartner } from '@/lib/content/server'

import { Container } from './Band'

/** "Our partners": greyscale logos (colour on hover), the name when there is no logo. */
export function PartnerLogos({ partners }: { partners: HomePartner[] }) {
  if (partners.length === 0) return null
  return (
    <section className="py-14" aria-labelledby="partners-heading" data-testid="partner-logos">
      <Container>
        <h2
          id="partners-heading"
          className="text-muted-foreground text-center text-sm font-semibold tracking-wide uppercase"
        >
          Our partners
        </h2>
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {partners.map((p) => {
            const body = p.logo ? (
              <Image
                src={p.logo}
                alt={p.name}
                width={160}
                height={80}
                unoptimized
                loading="lazy"
                className="h-12 w-auto max-w-40 object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
              />
            ) : (
              <span className="text-muted-foreground hover:text-brand-dark text-lg font-semibold transition">
                {p.name}
              </span>
            )
            return (
              <li key={p.id}>
                {p.websiteUrl ? (
                  <a
                    href={p.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${p.name} (opens in a new tab)`}
                    className="focus-visible:ring-brand-green block rounded focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {body}
                  </a>
                ) : (
                  body
                )}
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}
