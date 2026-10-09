import Image from 'next/image'
import Link from 'next/link'

import { siteConfig } from '@/config/site'

// Placeholder home page. Prompt 5 replaces this with the full landing page.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <Image
        src="/brand/go4solar-logo.png"
        alt={siteConfig.name}
        width={200}
        height={64}
        priority
        className="h-16 w-auto"
      />
      <h1 className="text-brand-dark text-4xl font-bold tracking-tight sm:text-5xl">
        Solar on monthly payments.
        <br />
        <span className="text-brand-green">Zero interest.</span>
      </h1>
      <p className="text-muted-foreground max-w-xl text-lg">
        We import directly from the manufacturers, so you pay less upfront and never pay interest.
        Start with 20%, spread the rest over up to 12 months.
      </p>
      <Link
        href="/calculate"
        className="bg-brand-orange hover:bg-brand-orange/90 focus-visible:ring-ring inline-flex h-12 items-center justify-center rounded-md px-8 text-base font-semibold text-white shadow transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Calculate my load
      </Link>
      <p className="text-muted-foreground text-sm">
        {siteConfig.legalName} · {siteConfig.address}
      </p>
    </main>
  )
}
