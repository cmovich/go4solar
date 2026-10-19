import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

const hasStaff = () => Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_TOTP_SECRET)

// The price list is shared with the live site: this test only LOOKS at the banner and never
// presses a Confirm button.
test('pricing: the SAMPLE banner says what is left and offers confirm buttons', async ({
  page,
}) => {
  test.skip(!hasStaff(), 'needs the e2e staff account')
  test.skip(test.info().project.name === 'mobile', 'one browser is enough')
  await loginAsStaff(page)
  await page.goto('/admin/pricing/components')
  const banner = page.getByTestId('sample-banner')
  await expect(banner).toBeVisible()
  const summary = (await page.getByTestId('sample-summary').textContent()) ?? ''
  expect(summary).toMatch(
    /^(\d+ items? still marked SAMPLE — prices are hidden on the website until (these are|it is) confirmed or changed|All prices confirmed — prices are showing on the website\.)$/,
  )
  if (/still marked SAMPLE/.test(summary)) {
    await expect(
      banner.getByRole('button', { name: 'Confirm all in this section' }).first(),
    ).toBeVisible()
    await expect(
      banner.getByRole('button', { name: /^Confirm .* as real price$/ }).first(),
    ).toBeVisible()
    // Switched-off tenures never appear.
    await expect(banner).not.toContainText('18 months rate')
    await expect(banner).not.toContainText('24 months rate')
  }
  // The banner is on every pricing section.
  await page.goto('/admin/pricing/margins')
  await expect(page.getByTestId('sample-banner')).toBeVisible()
})
