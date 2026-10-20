import type { Metadata } from 'next'
import Link from 'next/link'

import { Calculator } from '@/components/calculator/Calculator'
import { launchMode, siteConfig } from '@/config/site'
import { fetchApplianceLibrary } from '@/lib/appliances/library'
import { photoLookupAvailable } from '@/lib/providers/vision/available'
import { BrandLogo } from '@/components/brand/BrandLogo'

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
            <BrandLogo onDark priority className="h-12 w-auto" />
          </Link>
          <Link href="/" className="text-sm font-medium text-white/85 hover:text-white">
            Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Calculator
          library={library}
          launchMode={launchMode()}
          photoLookup={photoLookupAvailable()}
        />
      </main>
    </>
  )
}
