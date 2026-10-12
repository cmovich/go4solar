import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { WaitlistFlow } from '@/components/waitlist/WaitlistFlow'
import { launchMode, siteConfig } from '@/config/site'
import { fetchApplianceLibrary } from '@/lib/appliances/library'

export const metadata: Metadata = {
  title: 'Get your solar plan',
  description:
    'Calculate your load and see three estimated solar plans, each one fixed price. We get back to you within 7 days.',
}

export const revalidate = 3600

export default async function WaitlistPage() {
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
          <span className="text-brand-gold text-sm font-semibold">Your solar plan</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <WaitlistFlow
          library={library}
          messagingLive={process.env.MESSAGING_PROVIDER === 'live'}
          launchMode={launchMode()}
        />
      </main>
    </>
  )
}
