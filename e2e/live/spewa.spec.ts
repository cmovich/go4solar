import { expect, test } from '@playwright/test'

import { spewaMigrated } from '../helpers/spewa'
import { loginAsStaff } from '../helpers/staff'

/** Live build: the funder approver signs in with two-factor and lands on SPEWA approvals only. */
test('funder approver: SPEWA approvals and nothing else', async ({ page }) => {
  test.skip(!(await spewaMigrated()), 'migration 0038 not applied yet')
  test.skip(!process.env.E2E_SPEWA_EMAIL, 'no funder approver test account')
  await loginAsStaff(page, 'spewa')
  await expect(page.getByRole('link', { name: 'SPEWA approvals' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Applications' })).toHaveCount(0)
  await page.goto('/admin/applications')
  await expect(page).toHaveURL(/\/admin\/spewa$/)
  // Customer pages are unchanged: the home page still loads for everyone.
  await page.goto('/')
  await expect(page.getByTestId('ready-plans')).toBeVisible()
})
