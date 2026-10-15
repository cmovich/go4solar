import { test } from '@playwright/test'

import { checkPartnersPage } from '../helpers/partners'

test('live: footer → /partners → Sign up as an installer', async ({ page }) => {
  await checkPartnersPage(page)
})
