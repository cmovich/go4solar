import { expect, test } from '@playwright/test'

import { chooseAndAccept, payInFullMigrated } from '../helpers/readyPlans'
import { latestOtpFor, toE164 } from './helpers'

/**
 * Live: a ready-made plan paid in full. Account + phone code, then straight to the address and one
 * payment (no ID checks, guarantor or agreement); My account then says "Paid in full".
 */
test('pay in full → account → address → one payment → Paid in full', async ({ page }) => {
  test.setTimeout(240_000)
  test.skip(!(await payInFullMigrated()), 'migration 0035 not applied yet')
  const { phone } = await chooseAndAccept(page, 'oga-boss', { payInFull: true })
  await page.waitForURL(/\/account\?quote=/, { timeout: 45_000 })
  await page.getByLabel('Create a password').fill('Solar-Plan-2026!')
  await page.getByRole('button', { name: 'Create account and send code' }).click()
  await expect(page.getByLabel('6-digit code')).toBeVisible({ timeout: 45_000 })
  await page.getByLabel('6-digit code').fill(await latestOtpFor(toE164(phone)))
  await page.getByRole('button', { name: 'Verify my phone' }).click()
  // The wizard sends a pay-in-full order straight to the payment page.
  await page.waitForURL(/\/app\/pay-in-full/, { timeout: 45_000 })
  await expect(page.getByTestId('pif-summary')).toContainText('Oga Boss')
  await expect(page.getByTestId('pif-total')).toHaveText('₦1,450,770')
  await expect(page.locator('main')).not.toContainText(/interest|NIN|guarantor is needed/i)
  await page.getByLabel('Street address').fill('No. 5 Ali Akilu Road')
  await page.getByLabel('Town or city').fill('Kaduna')
  await page.getByLabel('Local government area').fill('Kaduna North')
  await page.getByTestId('pif-pay').click()
  await expect(page.getByTestId('mock-provider')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /^Pay ₦/ }).click()
  await page.waitForURL(/\/app(\?paid=full)?$/, { timeout: 45_000 })
  await expect(page.getByTestId('paid-in-full')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('plan-summary')).toContainText('Paid in full: ₦1,450,770')
})
