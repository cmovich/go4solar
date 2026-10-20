import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

const hasStaff = () => Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_TOTP_SECRET)

// The price list is shared with the live site: this test edits on screen and DISCARDS, never
// saving.
test('component specs: badge, filter, editor with plain-English checks (not saved)', async ({
  page,
}) => {
  test.skip(!hasStaff(), 'needs the e2e staff account')
  test.skip(test.info().project.name === 'mobile', 'one browser is enough')
  await loginAsStaff(page)
  await page.goto('/admin/pricing/components')
  const rows = page.getByTestId('component-row')
  await expect(rows.first()).toBeVisible()
  const total = await rows.count()

  // Filter: only rows missing specs.
  await page.getByRole('checkbox', { name: 'Show only rows missing specs' }).check()
  const missing = await rows.count()
  expect(missing).toBeLessThanOrEqual(total)
  await page.getByRole('checkbox', { name: 'Show only rows missing specs' }).uncheck()
  await expect(rows).toHaveCount(total)

  // Open the first panel's specs and type an impossible Vmp (higher than Voc).
  const panelRow = rows
    .filter({ has: page.getByRole('option', { name: 'Panels', selected: true }) })
    .first()
  await panelRow.getByRole('button', { name: 'Specs' }).click()
  const editor = page
    .locator('[data-testid^="specs-"]')
    .filter({ has: page.getByText('Voc', { exact: true }) })
    .first()
  await editor.getByLabel(/^Voc/).fill('40')
  await editor.getByLabel(/^Vmp/).fill('45')
  await expect(editor.getByRole('alert')).toContainText('Vmp must be lower than Voc')

  // Discard: nothing is saved.
  await page.getByRole('button', { name: 'Discard' }).click()
})
