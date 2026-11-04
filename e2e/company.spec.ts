import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

const hasStaff = () => Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_TOTP_SECRET)

/** Part I: company details (read only here: the e2e run never changes the real details). */
test('admin Company details shows the details printed on invoices', async ({ browser }) => {
  test.skip(!hasStaff(), 'needs the staff test user')
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.setTimeout(300_000)
  const staff = await browser.newPage({ storageState: 'e2e/storage-state.json' })
  await loginAsStaff(staff)
  await staff.goto('/admin/company')
  await expect(staff.getByRole('heading', { name: 'Company details' })).toBeVisible()
  await expect(staff.getByLabel('Company name')).not.toHaveValue('')
  await expect(staff.getByLabel('Email')).toHaveValue(/@/)
  await expect(staff.getByLabel('Quotes and invoices are valid for (days)')).not.toHaveValue('')
  await expect(staff.getByRole('link', { name: 'Company details' })).toBeVisible()
})

test('/verify with an unknown code says the invoice was not found (open in prelaunch)', async ({
  page,
}) => {
  await page.goto('/verify/zzzzzzzzzzzz')
  await expect(page.getByRole('heading', { name: 'Check an invoice' })).toBeVisible()
  await expect(page.getByTestId('verify-not-found')).toBeVisible()
})
