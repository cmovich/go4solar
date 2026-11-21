import { expect, test, type Page } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

/**
 * Pop-up windows never run off the screen (21 Nov: Edit funder's Save was off-screen on a
 * laptop). The window scrolls inside and Save / Cancel stay on screen. Nothing is saved.
 */
async function checkEditFunder(page: Page) {
  await page.goto('/admin/funders')
  await page.getByTestId('funders-table').getByRole('button', { name: 'Edit' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Edit funder' })
  await expect(dialog).toBeVisible()
  const viewport = page.viewportSize()!
  const box = (await dialog.boundingBox())!
  // The whole window fits on the screen.
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  // Save and Cancel are on screen before any scrolling.
  for (const name of [/Save funder/, /^Cancel$/])
    await expect(dialog.getByRole('button', { name })).toBeInViewport()
  // The form is taller than the window: it scrolls inside, and the buttons stay on screen.
  const scrolls = await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)
  expect(scrolls).toBe(true)
  await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await expect(dialog.getByRole('button', { name: /Save funder/ })).toBeInViewport()
  await dialog.evaluate((el) => el.scrollTo(0, 0))
  await expect(dialog.getByRole('button', { name: /Save funder/ })).toBeInViewport()
  await expect(dialog.getByText('Edit funder')).toBeInViewport()
  await test.info().attach(`edit-funder-${viewport.width}x${viewport.height}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await dialog.getByRole('button', { name: /^Cancel$/ }).click()
  await expect(dialog).toHaveCount(0)
}

test.describe('admin pop-up windows', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name === 'mobile', 'sizes are set in the test')
  })

  test('Edit funder: Save stays on screen on a laptop and on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 600 })
    await loginAsStaff(page)
    await checkEditFunder(page)
    await page.setViewportSize({ width: 375, height: 667 })
    await checkEditFunder(page)
  })
})
