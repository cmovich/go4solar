import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Calculator } from '@/components/calculator/Calculator'
import { launchMode, siteConfig } from '@/config/site'
import { fetchApplianceLibrary } from '@/lib/appliances/library'

export const metadata: Metadata = {
  title: 'Calculate my load',
  description:
    'Add the appliances you want to power and see your running watts, starting watts and daily energy in seconds.',
}

// The appliance library changes rarely: cache the page and refresh it hourly.
export const revalidate = 3600

export default async function CalculatePage() {
  const library = await fetchApplianceLibrary()

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
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Calculator library={library} launchMode={launchMode()} />
      </main>
    </>
  )
}
