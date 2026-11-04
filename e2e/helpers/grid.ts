import { expect, type Page } from '@playwright/test'

/** Part H: Grid insights for a signed-in staff member (test data shown so rows exist). */
export async function checkGridInsights(page: Page) {
  await page.goto('/admin/grid-insights')
  await expect(page.getByRole('heading', { name: 'Grid insights' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Grid insights' })).toBeVisible()
  // Real data only by default; e2e leads are test data, so switch them on to see rows.
  await page.goto('/admin/grid-insights?test=1')
  await expect(page.getByTestId('grid-table')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('grid-total')).toContainText('All states')
  await expect(page.getByTestId('grid-row').first()).toBeVisible()
  // A date range with no answers.
  await page.getByLabel('From').fill('2020-01-01')
  await page.getByLabel('To').fill('2020-01-31')
  await page.getByRole('button', { name: 'Show' }).click()
  await page.waitForURL(/from=2020-01-01/)
  await expect(page.getByTestId('grid-empty')).toBeVisible()
  // CSV with the same filters.
  const res = await page.request.get('/api/admin/grid-insights.csv?test=1')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/csv')
  const lines = (await res.text()).trim().split('\n')
  expect(lines[0]).toBe(
    'State,Answered,With hours,Avg day grid hours,Avg night grid hours,Blackout %,Uncertain %,Mode A,Mode B,Mode C,Mode D',
  )
  expect(lines.at(-1)).toMatch(/^All states,\d+,/)
}
