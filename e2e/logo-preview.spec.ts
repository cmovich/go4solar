import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

const hasStaff = () => Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_TOTP_SECRET)

test('staff logo preview: new logo on white and dark green, white logo on the hero photos, the old logo', async ({
  page,
}) => {
  test.skip(!hasStaff(), 'needs the e2e staff account')
  test.skip(test.info().project.name === 'mobile', 'one browser is enough')
  await loginAsStaff(page)
  await page.goto('/admin/logo-preview')
  await expect(page.getByRole('heading', { name: 'Logo preview' })).toBeVisible()
  await expect(page.getByTestId('logo-new').locator('img')).toHaveCount(3)
  await expect(page.getByTestId('logo-hero').getByRole('img', { name: 'Go4Solar' })).toHaveCount(4)
  await expect(page.getByTestId('logo-old').getByRole('img', { name: 'Current logo' })).toHaveCount(
    2,
  )
})

test('the logo preview is staff only', async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })
  await page.goto('/admin/logo-preview')
  await expect(page).toHaveURL(/\/login/)
  await page.close()
})
