import { expect, test } from '@playwright/test'

import { buildFromLoad, checkBreakdown, fillBuildContact } from '../helpers/builder'
import { cannotGoBelow30, offerReady, startBusinessBuilder } from '../helpers/spewaOffer'

/**
 * Live: a business or institution builds a system with the SPEWA offer, applies, and sees one
 * fixed total on "Your quotation" (valid for the offer's 7 days). Skips until migration 0039 is
 * applied and SPEWA's price list is loaded.
 */
test('live: business builder → SPEWA offer → Apply → quotation', async ({ page }) => {
  test.setTimeout(240_000)
  test.skip(!(await offerReady()), 'SPEWA offer not set up yet (0039 + price list)')
  await startBusinessBuilder(page)
  await buildFromLoad(page, '8')
  test.skip(
    (await page.getByTestId('build-deposit-pct').count()) === 0,
    'prices are SAMPLE: no deposit shown',
  )
  await cannotGoBelow30(page, 'build-deposit-pct')
  await checkBreakdown(page, true)
  await page.getByTestId('see-breakdown').click()
  await fillBuildContact(page)
  await page.getByTestId('build-submit').click()
  await page.waitForURL(/\/quotation\/[0-9a-f-]{36}$/, { timeout: 45_000 })
  const quotation = page.getByTestId('quotation')
  await expect(quotation).toContainText('Total amount payable', { timeout: 30_000 })
  await expect(quotation).toContainText('No hidden charges')
  // Items at their SPEWA selling price; the payment plan charge is its own line.
  await expect(page.getByTestId('quotation-lines')).toContainText(
    'Payment plan charge (12 months, 30%)',
  )
  // Amount financed (price − deposit), the charge apart, then the balance to repay monthly.
  const fin = page.getByTestId('quotation-financing')
  await expect(fin).toContainText('Amount financed')
  await expect(fin).toContainText('Payment plan charge (12 months, 30%)')
  await expect(fin).toContainText('Balance to repay monthly')
  const [financed, charge, balance] = (await fin.locator('strong').allTextContents()).map((t) =>
    Number(t.replace(/[^0-9]/g, '')),
  )
  expect(financed! + charge!).toBe(balance)
  await expect(quotation).not.toContainText(/interest/i)
  // SPEWA's price list: quotes valid for 7 days.
  const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  })
  await expect(page.getByTestId('quotation-notes')).toContainText(until)
})
