import Link from 'next/link'

import { HERO_SLIDES } from '@/config/heroSlides'
import { siteConfig } from '@/config/site'
import { formatNaira } from '@/lib/money'
import { PRICE_LATER_TEXT } from '@/lib/waitlist/schema'

import { Band, Container } from './Band'
import { HeroBackdrop } from './HeroBackdrop'
import { BrandLogo } from '@/components/brand/BrandLogo'

export type HeroExample = {
  rows: { label: string; value: string }[]
  monthly: number
  months: number
  total: number
  /** True while any price used is a SAMPLE price: no naira amounts and no interest claims. */
  sample: boolean
  /** Longest payment plan switched on in /admin/pricing. */
  maxMonths: number
}

/** Hero explainer (Semako, 2026-10-20; no interest claim, so the same in every price mode). */
export const EXPLAINER = 'Starting from 20% deposit. Get your solar installed and pay monthly.'

/** Under the hero explainer (Semako, 2026-10-20). */
export const TOTAL_ON_EVERY_PLAN = 'Total amount payable is shown on every plan before you sign.'

const badgesFor = (sample: boolean, maxMonths: number) => [
  sample
    ? { title: 'One fixed price', line: 'Shown in full before you sign' }
    : { title: '0% interest', line: 'One fixed price, shown in full before you sign' },
  { title: 'Direct importers', line: 'Factory prices, no middlemen, genuine warranty' },
  { title: 'From 20% deposit', line: `The rest in up to ${maxMonths} monthly payments` },
]

/**
 * Headline "Go 4 Solar, Pay Easy, No Interest". Any interest claim must sit next to the total
 * amount payable, so while prices are SAMPLE prices (totals hidden) the hero drops "No Interest"
 * and "no interest attached" until real prices are saved.
 */
export function Hero({ example }: { example: HeroExample }) {
  const badges = badgesFor(example.sample, example.maxMonths)
  return (
    <Band angled accent>
      <HeroBackdrop slides={HERO_SLIDES} />
      <Container className="relative z-10">
        <header className="flex items-center justify-between py-5">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            {/* The logo is dark-on-transparent; a white plate keeps it legible on green. */}
            <BrandLogo onDark priority className="h-20 w-auto sm:h-24" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-white/85 sm:flex">
            <a href="#how-it-works" className="hover:text-white">
              How it works
            </a>
            <a href="#faq" className="hover:text-white">
              FAQ
            </a>
            <Link href="/partners" className="hover:text-white">
              Partners
            </Link>
          </nav>
        </header>

        <div className="grid gap-12 pt-10 pb-24 sm:pt-16 sm:pb-32 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center">
          <div className="max-w-3xl [text-shadow:0_1px_3px_rgb(0_0_0/0.6),0_0_18px_rgb(0_0_0/0.45)]">
            {/* Three short lines on a phone, two on wider screens. */}
            <h1 className="text-[2.6rem] leading-[1.05] font-bold tracking-tight sm:text-6xl">
              <span className="block sm:inline">Go 4 Solar,</span>{' '}
              <span className="block sm:inline">Pay Easy{example.sample ? '' : ','}</span>
              {!example.sample && (
                <>
                  {' '}
                  <span className="text-brand-gold block">No Interest</span>
                </>
              )}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white sm:text-xl">{EXPLAINER}</p>
            {/* Decision 2026-10-20 (CLAUDE.md §9): the hero's no-interest claim carries this line
                instead of an example total; every plan, quote and agreement shows the total. */}
            <p className="mt-3 text-sm font-semibold text-white" data-testid="hero-total">
              {example.sample ? PRICE_LATER_TEXT : TOTAL_ON_EVERY_PLAN}
            </p>

            <div className="mt-8">
              <Link
                href="/calculate"
                className="bg-brand-orange hover:bg-brand-orange/90 focus-visible:ring-brand-gold focus-visible:ring-offset-brand-dark text-brand-dark inline-flex h-14 w-full items-center justify-center rounded-lg px-8 text-lg font-semibold shadow-lg shadow-black/20 transition-colors [text-shadow:none] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
              >
                Calculate my load
              </Link>
            </div>

            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {badges.map((b) => (
                <li
                  key={b.title}
                  className="bg-brand-dark/60 rounded-lg border border-white/15 px-4 py-3 backdrop-blur-sm"
                >
                  <p className="text-brand-gold text-base font-semibold">{b.title}</p>
                  <p className="mt-1 text-sm text-white">{b.line}</p>
                </li>
              ))}
            </ul>

            <p className="bg-brand-dark/60 mt-8 inline-block rounded-md px-2 py-1 text-sm font-medium text-white">
              20+ homes and businesses financed · ~1 MW installed
            </p>
          </div>

          {/* Desktop only: the badges already carry this message on phones. */}
          <aside className="text-brand-dark relative hidden rounded-2xl bg-white p-6 shadow-2xl shadow-black/30 lg:block">
            <span className="bg-brand-orange text-brand-dark absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase">
              Example
            </span>
            <p className="text-brand-green text-sm font-semibold tracking-wide uppercase">
              Example plan
            </p>
            <p className="mt-1 text-2xl font-bold">Comfort plan</p>
            <dl className="mt-4 divide-y divide-black/5 text-sm">
              {example.rows.map((r) => (
                <div key={r.label} className="flex justify-between py-2">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
            {example.sample ? (
              <p className="mt-4 text-sm font-semibold" data-testid="hero-price-later">
                {PRICE_LATER_TEXT}
              </p>
            ) : (
              <>
                <p className="mt-5 text-3xl font-bold tracking-tight">
                  {formatNaira(example.monthly)}
                  <span className="text-muted-foreground text-base font-medium">
                    {' '}
                    / month for {example.months} months
                  </span>
                </p>
                <p className="text-muted-foreground mt-2 text-sm font-medium">
                  Total {formatNaira(example.total)} · 0% interest
                </p>
              </>
            )}
          </aside>
        </div>
      </Container>
    </Band>
  )
}
