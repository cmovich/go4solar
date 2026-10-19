import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { InstallerForm } from '@/components/waitlist/InstallerForm'
import { siteConfig } from '@/config/site'

export const metadata: Metadata = {
  title: 'Become a partner installer',
  description:
    'Join the Go4Solar installer network. We bring verified customers who have paid a deposit; you install genuine equipment and get paid on time.',
}

export default function InstallerPartnerPage() {
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
          For installers
        </p>
        <h1 className="text-brand-dark mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Become a Go4Solar partner installer
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-base">
          We are building our installer network across Nigeria. Tell us about your business and we
          will be in touch.
        </p>
        <div className="mt-8">
          <InstallerForm />
        </div>
      </main>
    </>
  )
}
