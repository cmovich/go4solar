import type { LaunchMode } from '@/config/site'

export type Block = { redirect: string } | { notFound: true }

/** Live-only pages: closed in prelaunch (the visitor is sent home). */
const LIVE_ONLY_PAGES = [
  '/plans',
  '/account',
  '/app',
  '/guarantee',
  '/verify-email',
  '/test-mode',
  '/partners/vendor',
]
/** Live-only APIs: answer 404 in prelaunch. */
const LIVE_ONLY_APIS = ['/api/webhooks/paystack']

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

/**
 * What the middleware does with a request while the site is in prelaunch (the waiting list only).
 * Staff pages (/admin, /login), crons, the calculator, the sign-up, the installer form and the
 * legal pages stay open. Pure, so it is unit-tested.
 */
export function prelaunchBlock(path: string, mode: LaunchMode): Block | null {
  if (mode !== 'prelaunch') return null
  if (under(path, '/get-started')) return { redirect: '/waitlist' }
  if (LIVE_ONLY_PAGES.some((p) => under(path, p))) return { redirect: '/' }
  if (LIVE_ONLY_APIS.some((p) => under(path, p))) return { notFound: true }
  return null
}
