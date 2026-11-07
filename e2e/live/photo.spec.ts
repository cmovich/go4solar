import { test } from '@playwright/test'

import { appliancePhoto, labelPhoto } from '../helpers/photo'

/** Part C in live mode (mock vision provider locally). */
test('live: photo of the label', async ({ page }) => {
  await labelPhoto(page)
})

test('live: photo of the appliance (estimated)', async ({ page }) => {
  await appliancePhoto(page)
})
