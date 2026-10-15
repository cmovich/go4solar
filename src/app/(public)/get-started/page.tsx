import type { Metadata } from 'next'

import WaitlistPage from '../waitlist/page'

export const metadata: Metadata = {
  title: 'Get your solar plan',
  description:
    'Calculate your load and see three solar plans, each one fixed price, sized for your home or business.',
}

export const revalidate = 3600

/** Customer-facing name for the same flow as /waitlist (which keeps working in prelaunch). */
export default WaitlistPage
