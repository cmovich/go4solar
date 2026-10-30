import type { Metadata } from 'next'
import Link from 'next/link'

import { WaitlistFlow } from '@/components/waitlist/WaitlistFlow'
import { launchMode, siteConfig } from '@/config/site'
import { fetchApplianceLibrary } from '@/lib/appliances/library'
import { photoLookupAvailable } from '@/lib/providers/vision/available'
import { fetchRoofTypes, fetchWiring } from '@/lib/wizard/server'
import { BrandLogo } from '@/components/brand/BrandLogo'

export const metadata: Metadata = {
  title: 'Get your solar plan',
  description: 'Calculate your load and see three estimated solar plans, each one fixed price.',
}

export const revalidate = 3600

export default async function WaitlistPage() {
  const [library, roofTypes, wiring] = await Promise.all([
    fetchApplianceLibrary(),
    fetchRoofTypes(),
    fetchWiring(),
  ])
  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <BrandLogo onDark priority className="h-12 w-auto" />
          </Link>
          <span className="text-brand-gold text-sm font-semibold">Your solar plan</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <WaitlistFlow
          library={library}
          messagingLive={process.env.MESSAGING_PROVIDER === 'live'}
          launchMode={launchMode()}
          photoLookup={photoLookupAvailable()}
          roofTypes={roofTypes}
          wiring={wiring}
        />
      </main>
    </>
  )
}
