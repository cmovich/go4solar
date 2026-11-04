export type LaunchMode = 'prelaunch' | 'live'

/**
 * The brand name and site address. The company's name, address, phone numbers, email and RC
 * number live in one place: the admin "Company details" setting (`loadCompany()`, with the
 * defaults in src/lib/company/schema.ts).
 */
export const siteConfig = {
  name: 'Go4Solar',
  url: 'https://www.go4solar.app',
} as const

/**
 * Which call-to-action the site shows.
 * `prelaunch` → the waiting list. `live` → quotes and applications.
 * Read from NEXT_PUBLIC_LAUNCH_MODE; anything else falls back to `prelaunch`.
 */
export function launchMode(): LaunchMode {
  return process.env.NEXT_PUBLIC_LAUNCH_MODE === 'live' ? 'live' : 'prelaunch'
}
