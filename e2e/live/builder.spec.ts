import { expect, test } from '@playwright/test'

import {
  buildFromLoad,
  builderToCalculator,
  fillBuildContact,
  OLD_SAVES,
  pagesSurviveOldSaves,
  startBuilder,
} from '../helpers/builder'

/** Part F (live): a built system goes on to the account step like any plan. */
test('builder → Apply → account step', async ({ page }) => {
  test.setTimeout(180_000)
  await startBuilder(page)
  await buildFromLoad(page)
  await expect(page.getByTestId('build-submit')).toHaveText('Apply')
  await fillBuildContact(page)
  await page.getByTestId('build-submit').click()
  await expect(page).toHaveURL(/\/account\?quote=/, { timeout: 45_000 })
  await expect(page.getByText('Your own system')).toBeVisible()
})

test('live: builder → calculator → See my solar plans', async ({ page }) => {
  test.setTimeout(180_000)
  await builderToCalculator(page)
  await page.getByRole('link', { name: 'See my solar plans' }).click()
  await expect(page.getByRole('heading', { name: 'Your total load' })).toBeVisible({
    timeout: 30_000,
  })
  await page.goBack()
  await page.getByTestId('back-to-builder').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose your items')
})

for (const [name, save] of Object.entries(OLD_SAVES)) {
  test(`live: old or broken saved data never breaks a page: ${name}`, async ({ page }) => {
    test.setTimeout(180_000)
    await pagesSurviveOldSaves(page, save, '/get-started?from=calculate')
  })
}
