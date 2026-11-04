import { test } from '@playwright/test'

import { checkGridInsights } from '../helpers/grid'

import { loginAsStaff } from './helpers'

test('admin Grid insights: by state, date filter, CSV (live)', async ({ page }) => {
  test.setTimeout(300_000)
  await loginAsStaff(page)
  await checkGridInsights(page)
})
