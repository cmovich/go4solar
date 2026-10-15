import { expect, type Page } from '@playwright/test'

/**
 * Fix #8: /partners was a 404. Home header and footer "Partners" (both open /partners) → the
 * programme page → "Sign up as an installer" → the installer form. No vendor button while no
 * vendor sign-up page exists.
 */
export async function checkPartnersPage(page: Page) {
  await page.goto('/')
  const partners = page.getByRole('link', { name: 'Partners', exact: true })
  // Header (desktop only) and footer.
  for (const link of await partners.all()) await expect(link).toHaveAttribute('href', '/partners')
  await partners.last().click()
  await page.waitForURL(/\/partners$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Grow with Go4Solar' })).toBeVisible()
  await expect(page.getByRole('link', { name: /vendor/i })).toHaveCount(0)
  await page.getByRole('link', { name: 'Sign up as an installer' }).click()
  await page.waitForURL(/\/partners\/installer$/)
  await expect(
    page.getByRole('heading', { name: 'Become a Go4Solar partner installer' }),
  ).toBeVisible()
}
