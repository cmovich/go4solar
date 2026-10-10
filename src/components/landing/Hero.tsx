import Image from 'next/image'
import Link from 'next/link'

import { siteConfig } from '@/config/site'

import { Band, Container } from './Band'

const badges = [
  { title: '0% interest', line: 'One fixed price, shown in full before you sign' },
  { title: 'Direct importers', line: 'Factory prices, no middlemen, genuine warranty' },
  { title: 'From 20% deposit', line: 'The rest in up to 12 monthly payments' },
]

export function Hero() {
  return (
    <Band angled accent>
      <Container>
        <header className="flex items-center justify-between py-5">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            {/* The logo is dark-on-transparent; a white plate keeps it legible on green. */}
            <span className="inline-flex rounded-md bg-white px-3 py-1.5">
              <Image
                src="/brand/go4solar-logo.png"
                alt={siteConfig.name}
                width={150}
                height={48}
                priority
                className="h-9 w-auto"
              />
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-white/85 sm:flex">
            <a href="#how-it-works" className="hover:text-white">
              How it works
            </a>
            <a href="#faq" className="hover:text-white">
              FAQ
            </a>
            <Link href="/partners/installer" prefetch={false} className="hover:text-white">
              Partners
            </Link>
          </nav>
        </header>

        <div className="max-w-3xl pt-10 pb-24 sm:pt-16 sm:pb-32">
          <h1 className="text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
            Solar on monthly payments.
            <br />
            <span className="text-brand-gold">Zero interest.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-white/85 sm:text-xl">
            We import directly from the manufacturers, so you pay less upfront and never pay
            interest. Start with 20%, spread the rest over up to 12 months.
          </p>

          <div className="mt-8">
            <Link
              href="/calculate"
              prefetch={false}
              className="bg-brand-orange hover:bg-brand-orange/90 focus-visible:ring-brand-gold focus-visible:ring-offset-brand-dark inline-flex h-14 w-full items-center justify-center rounded-lg px-8 text-lg font-semibold text-white shadow-lg shadow-black/20 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
            >
              Calculate my load
            </Link>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {badges.map((b) => (
              <li
                key={b.title}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm"
              >
                <p className="text-brand-gold text-base font-semibold">{b.title}</p>
                <p className="mt-1 text-sm text-white/80">{b.line}</p>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-sm font-medium text-white/70">
            20+ homes and businesses financed · ~1 MW installed
          </p>
        </div>
      </Container>
    </Band>
  )
}
