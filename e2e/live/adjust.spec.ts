import { expect, test } from '@playwright/test'

import { testEmail } from '../helpers/test-identity'

import { freshNin, freshPhone, throughDetails } from './helpers'

/** Live: /plans → Adjust this quote → change an item → back on /plans, new price, no details. */
test('live: Adjust this quote returns to the plans with the new price', async ({ page }) => {
  test.setTimeout(300_000)
  const phone = freshPhone()
  await throughDetails(page, {
    phone,
    email: testEmail('live-adjust', phone),
    nin: freshNin(),
    type: 'individual',
    firstName: 'Chidi',
    surname: 'Eze',
  })
  await page.waitForURL(/\/plans\?estimate=/, { timeout: 30000 })
  const plansUrl = page.url()
  await expect(page.getByTestId('change-links')).toBeVisible()
  const before = await page.getByTestId('total-comfort').textContent()
  await page.getByTestId('adjust-comfort').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose your items', {
    timeout: 30000,
  })
  const batteries = page.getByTestId('bar-battery')
  await batteries.getByRole('button').first().click()
  await batteries
    .getByRole('button', { name: /^More / })
    .first()
    .click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByTestId('adjust-note')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your details' })).toHaveCount(0)
  await page.getByTestId('update-plans').click()
  await page.waitForURL(plansUrl, { timeout: 30000 })
  await expect(page.getByTestId('adjusted-comfort')).toHaveText('Adjusted by you')
  await expect(page.getByTestId('total-comfort')).not.toHaveText(before ?? '')
  await expect(page.getByLabel('Phone number')).toHaveCount(0)
})
