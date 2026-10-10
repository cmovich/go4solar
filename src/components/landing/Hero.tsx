import Image from 'next/image'
import Link from 'next/link'

import { siteConfig } from '@/config/site'
import { formatNaira } from '@/lib/money'

import { Band, Container } from './Band'

// PRD worked example: Comfort plan for the sample home, 20% deposit, 12 months.
const examplePlan = {
  rows: [
    { label: 'Inverter', value: '1 kVA' },
    { label: 'Battery', value: '7.5 kWh' },
    { label: 'Panels', value: '5 × 550 W' },
    { label: 'Backup', value: 'about 11 hours at full load' },
  ],
  monthly: 165017,
  months: 12,
  total: 2475248,
}

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
            <span className="inline-flex rounded-lg bg-white px-4 py-2">
              <Image
                src="/brand/go4solar-logo.png"
                alt={siteConfig.name}
                width={300}
                height={96}
                priority
                className="h-16 w-auto sm:h-[4.5rem]"
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

        <div className="grid gap-12 pt-10 pb-24 sm:pt-16 sm:pb-32 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center">
          <div className="max-w-3xl">
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

          {/* Desktop only: the badges already carry this message on phones. */}
          <aside className="text-brand-dark relative hidden rounded-2xl bg-white p-6 shadow-2xl shadow-black/30 lg:block">
            <span className="bg-brand-orange absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-bold tracking-wide text-white uppercase">
              Example
            </span>
            <p className="text-brand-green text-sm font-semibold tracking-wide uppercase">
              Example plan
            </p>
            <p className="mt-1 text-2xl font-bold">Comfort plan</p>
            <dl className="mt-4 divide-y divide-black/5 text-sm">
              {examplePlan.rows.map((r) => (
                <div key={r.label} className="flex justify-between py-2">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="font-semibold">{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-3xl font-bold tracking-tight">
              {formatNaira(examplePlan.monthly)}
              <span className="text-muted-foreground text-base font-medium">
                {' '}
                / month for {examplePlan.months} months
              </span>
            </p>
            <p className="text-muted-foreground mt-2 text-sm font-medium">
              Total {formatNaira(examplePlan.total)} · 0% interest
            </p>
          </aside>
        </div>
      </Container>
    </Band>
  )
}
