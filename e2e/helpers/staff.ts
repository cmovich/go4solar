import { expect, type Page } from '@playwright/test'

import { totp } from './totp'

/** Signs in as the e2e staff member (super admin, made by global-setup) with the authenticator. */
export async function loginAsStaff(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_STAFF_EMAIL!)
  await page.getByLabel('Password').fill(process.env.E2E_STAFF_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/admin\/mfa/)
  await page.getByLabel('6-digit code').fill(totp(process.env.E2E_STAFF_TOTP_SECRET!))
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.waitForURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'Back office' })).toBeVisible()
}
