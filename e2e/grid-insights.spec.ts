import { test } from '@playwright/test'

import { checkGridInsights } from './helpers/grid'
import { loginAsStaff } from './helpers/staff'

const hasStaff = () => Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_TOTP_SECRET)

test('admin Grid insights: by state, date filter, CSV (prelaunch)', async ({ browser }) => {
  test.skip(!hasStaff(), 'needs the staff test user')
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.setTimeout(300_000)
  const staff = await browser.newPage({ storageState: 'e2e/storage-state.json' })
  await loginAsStaff(staff)
  await checkGridInsights(staff)
})
