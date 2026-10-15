import Link from 'next/link'

import { launchMode } from '@/config/site'

/** Slim strip above the hero while the waiting list is open. Hidden in live mode. */
export function PrelaunchBanner() {
  if (launchMode() !== 'prelaunch') return null
  return (
    <div className="bg-brand-green text-center text-sm font-medium text-white">
      <Link href="/waitlist" prefetch={false} className="hover:bg-brand-green/90 block px-4 py-2">
        Prelaunch: calculate your load and get your solar plan — we&apos;ll get back to you within 7
        days
      </Link>
    </div>
  )
}
