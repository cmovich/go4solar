import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { siteConfig } from '@/config/site'

export const metadata: Metadata = {
  title: 'Partner with Go4Solar',
  description:
    'Installers: join the Go4Solar partner network across Nigeria. We bring verified customers; you install genuine equipment and get paid on time.',
}

const POINTS = [
  {
    title: 'Verified customers',
    body: 'Every customer we send you has been checked and has already paid a deposit.',
  },
  {
    title: 'Genuine equipment',
    body: 'Go4Solar imports directly from the manufacturers, so every system starts with genuine parts.',
  },
  {
    title: 'Paid on time',
    body: 'When the customer confirms their system is installed and working, your payment is released.',
  },
]

/** The partner programme (fix #8: /partners was a 404). Open in both launch modes. */
export default function PartnersPage() {
  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
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
          <Link href="/" className="text-sm font-medium text-white/85 hover:text-white">
            Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-brand-green text-sm font-semibold tracking-wide uppercase">
          Partner programme
        </p>
        <h1 className="text-brand-dark mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Grow with Go4Solar
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-base">
          We are building a network of trusted solar installers across Nigeria. We find the
          customers and handle their payment plans; you do what you do best: quality installations.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {POINTS.map((p) => (
            <li key={p.title} className="bg-brand-mist rounded-xl p-5">
              <h2 className="text-brand-dark text-base font-semibold">{p.title}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{p.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <Link
            href="/partners/installer"
            className="bg-brand-orange hover:bg-brand-orange/90 text-brand-dark focus-visible:ring-brand-gold inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Sign up as an installer
          </Link>
        </div>
      </main>
    </>
  )
}
