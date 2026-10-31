import { expect, test } from '@playwright/test'

import { buildFromLoad, fillBuildContact, startBuilder } from '../helpers/builder'

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
