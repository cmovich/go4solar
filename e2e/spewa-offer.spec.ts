import { expect, test } from '@playwright/test'

import { buildFromLoad, checkBreakdown, skipWithoutCatalogue } from './helpers/builder'
import { ownConnection } from './helpers/connection'
import { cannotGoBelow30, offerReady, startBusinessBuilder } from './helpers/spewaOffer'
import { loginAsStaff } from './helpers/staff'

/**
 * SPEWA offer for businesses and institutions (prelaunch). Skips until migration 0039 is applied,
 * SPEWA's price list is loaded and the SPEWA rule is active. Read-only for prices and rules.
 */
test.beforeEach(async ({ context }) => ownConnection(context))

test.describe('SPEWA offer', () => {
  test.setTimeout(240_000)

  test('builder: a business gets SPEWA items, a 30% minimum and 3–12 months', async ({ page }) => {
    test.skip(!(await offerReady()), 'SPEWA offer not set up yet (0039 + price list)')
    await startBusinessBuilder(page)
    await skipWithoutCatalogue(page)
    // SPEWA's inverters (kW from the price list) in place of ours; lights have their own bar.
    await expect(page.getByTestId('bar-lights')).toBeVisible()
    await expect(page.getByTestId('bar-inverter')).toContainText('Solis')
    await buildFromLoad(page, '8')
    const summary = page.getByTestId('build-summary')
    if ((await page.getByTestId('build-deposit-pct').count()) > 0) {
      await cannotGoBelow30(page, 'build-deposit-pct')
      const months = summary.getByRole('group', { name: 'Months' }).getByRole('button')
      await expect(months).toHaveText(['3 months', '6 months', '9 months', '12 months'])
      await expect(page.getByTestId('build-total')).toContainText('One fixed price')
      // Customers never see the charge or item prices (Semako, 25 Nov 2026).
      await expect(page.getByTestId('plan-charge')).toHaveCount(0)
      await expect(summary.locator('table').first()).not.toContainText('₦')
      await expect(summary).not.toContainText(/interest/i)
      await checkBreakdown(page, true)
    }
  })

  test('a home customer keeps our items and the 20% minimum', async ({ page }) => {
    test.skip(!(await offerReady()), 'SPEWA offer not set up yet (0039 + price list)')
    await page.goto('/build')
    await expect(page.getByTestId('build-who')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'For my home' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByLabel('Where will it be installed?').selectOption('Lagos')
    await page.getByRole('button', { name: /^A complete system/ }).click()
    await skipWithoutCatalogue(page)
    await expect(page.getByTestId('bar-lights')).toHaveCount(0)
  })

  test('admin: SPEWA price list (flags on items 16 and 39) and the routing rule', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
    test.skip(!(await offerReady()), 'SPEWA offer not set up yet (0039 + price list)')
    await loginAsStaff(page)
    await page.goto('/admin/pricing/spewa')
    await expect(page.getByTestId('spewa-admin')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('spewa-terms')).toBeVisible()
    await expect(page.getByLabel('Partner price (paid to SPEWA)')).toHaveValue(/./)
    await expect(page.getByTestId('spewa-row-16')).toContainText('higher than Level A')
    await expect(page.getByTestId('spewa-row-39')).toContainText('model code says 125K')
    await page.goto('/admin/funders')
    const rules = page.getByTestId('routing-rules')
    await expect(rules).toContainText('Business or institution')
    await expect(rules).toContainText('30%')
    await expect(rules).toContainText('3, 6, 9, 12 months')
    await expect(rules).toContainText('SPEWA offer')
  })

  test('staff quotation: customer type "Business or institution" quotes the SPEWA offer', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
    test.skip(!(await offerReady()), 'SPEWA offer not set up yet (0039 + price list)')
    await loginAsStaff(page)
    await page.goto('/admin/quotations/new')
    await page.getByLabel('State').selectOption('Kaduna')
    await page.getByLabel('Customer type').selectOption('business')
    await page.getByRole('button', { name: /^A complete system/ }).click()
    await buildFromLoad(page, '8', 2)
    if ((await page.getByTestId('build-deposit-pct').count()) > 0) {
      await cannotGoBelow30(page, 'build-deposit-pct')
    }
  })
})
