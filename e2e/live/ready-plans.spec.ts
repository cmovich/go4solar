import { expect, test } from '@playwright/test'

import { checkCarousel, checkSeeMore, chooseAndAccept, readyPlansMigrated } from '../helpers/readyPlans'

/** Live: accepting a ready-made plan goes on to the account step (phone code, then ID checks). */
test('ready-made plan → quotation → Accept and apply → account step', async ({ page }) => {
  test.setTimeout(180_000)
  test.skip(!(await readyPlansMigrated()), 'migration 0034 not applied yet')
  await chooseAndAccept(page, 'oga-boss')
  await page.waitForURL(/\/account\?quote=[0-9a-f-]{36}/, { timeout: 45_000 })
  await expect(page.getByText('Oga Boss')).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/interest/i)
})

/** Live: the home page shows the ticked plans; See more / Show fewer (no reload, no jump). */
test('home page: See more plans reveals the rest, Show fewer hides them', async ({ page }) => {
  test.skip(!(await readyPlansMigrated()), 'migration 0034 not applied yet')
  await page.goto('/')
  await checkCarousel(page, test.info().project.name.includes('mobile'))
  await checkSeeMore(page, test.info().project.name.includes('mobile'))
})
