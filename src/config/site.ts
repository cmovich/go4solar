export type LaunchMode = 'prelaunch' | 'live'

export type LaunchState = 'FCT' | 'Kaduna' | 'Lagos'

export const siteConfig = {
  name: 'Go4Solar',
  legalName: 'Go4Solar Energy Limited',
  address: 'Suite 40, Jayjay Shopping Complex',
  email: 'Contact@go4solar.app',
  phones: ['08182112423', '08037142948', '08083143614'] as const,
  url: 'https://www.go4solar.app',
  launchStates: ['FCT', 'Kaduna', 'Lagos'] as const satisfies readonly LaunchState[],
} as const

/**
 * Which call-to-action the site shows.
 * `prelaunch` → the waiting list. `live` → quotes and applications.
 * Read from NEXT_PUBLIC_LAUNCH_MODE; anything else falls back to `prelaunch`.
 */
export function launchMode(): LaunchMode {
  return process.env.NEXT_PUBLIC_LAUNCH_MODE === 'live' ? 'live' : 'prelaunch'
}
