import { expect, test } from '@playwright/test'

import { loginAsStaff } from '../helpers/staff'
import { createQuotationAsStaff, staffQuotesMigrated } from '../helpers/staffQuotes'
import { testEmail, testPhone } from '../helpers/test-identity'

/** Live: a staff quotation's "Accept and apply" starts the customer's own application. */
test('staff quotation → customer accepts → account step (phone code next)', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.E2E_STAFF_EMAIL, 'needs the e2e staff account')
  test.skip(!(await staffQuotesMigrated()), 'migration 0032 not applied yet')
  await loginAsStaff(page)
  const { link } = await createQuotationAsStaff(page, { name: '', phone: '' })

  const customer = await browser.newContext({ storageState: undefined })
  const c = await customer.newPage()
  await c.goto(link)
  await c.getByTestId('accept-and-apply').click()
  // No name or phone from staff: the customer types everything.
  await expect(c.getByLabel('First name', { exact: true })).toHaveValue('')
  await c.getByLabel('First name', { exact: true }).fill('Shared')
  await c.getByLabel('Surname', { exact: true }).fill(`Quote${Date.now() % 100000}`)
  await c.getByLabel('Phone number', { exact: true }).fill(testPhone())
  await c.getByLabel('Email address', { exact: true }).fill(testEmail('staffq-live'))
  await c.getByLabel('Local government area', { exact: true }).fill('Ikeja')
  await c.getByRole('checkbox', { name: /may contact me about this system/ }).check()
  await c.getByTestId('accept-submit').click()
  await c.waitForURL(/\/account\?quote=[0-9a-f-]{36}/, { timeout: 45_000 })
  await expect(c.getByText('Your own system')).toBeVisible()
  // The same link again on this phone: back to the account step, never a second sign-up.
  await c.goto(link)
  await c.waitForURL(/\/account\?quote=/, { timeout: 30_000 })
  await customer.close()
})
