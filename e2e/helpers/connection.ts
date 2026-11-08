import type { BrowserContext } from '@playwright/test'

/**
 * Each sign-up test gets its own connection address (x-forwarded-for, which clientIp() reads),
 * so a full test run is not stopped by the "20 new sign-ups an hour per connection" limit that
 * protects the real site.
 */
export async function ownConnection(context: BrowserContext) {
  const n = () => Math.floor(Math.random() * 250) + 1
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` })
}
