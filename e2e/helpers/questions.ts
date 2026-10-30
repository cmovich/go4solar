import { expect, type Page } from '@playwright/test'

/**
 * Part E: the quote questions between "who is it for" and the energy screen. Default answers:
 * complete system, Comfort, grid A for 6 h (2 day / 4 night), roof (first roof card), aluminium
 * rack, the default building, wire estimated.
 */
export async function answerQuoteQuestions(
  page: Page,
  o: { style?: 'Comfort' | 'Essentials' | '24-hour off-grid' } = {},
) {
  await expect(page.getByTestId('q-scope')).toBeVisible({ timeout: 45_000 })
  await page.getByRole('button', { name: /^A complete system/ }).click()
  await expect(page.getByTestId('q-style')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: new RegExp(`^${o.style ?? 'Comfort'}`) }).click()
  await expect(page.getByTestId('q-grid')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /^Yes, let it charge and bypass/ }).click()
  await expect(page.getByTestId('q-gridHours')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /^A number of hours/ }).click()
  await page.getByLabel('Hours a day', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByTestId('q-gridTime')).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('Day hours', { exact: true }).fill('2')
  await page.getByLabel('Night hours', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByTestId('q-mounting')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /^Roof/ }).click()
  await expect(page.getByTestId('q-roofType')).toBeVisible({ timeout: 20_000 })
  const cards = page.getByTestId('roof-card')
  if ((await cards.count()) > 0) await cards.first().click()
  else await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByTestId('q-rack')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /^Yes/ }).click()
  await page.getByRole('button', { name: 'Aluminium' }).click()
  await expect(page.getByTestId('q-height')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByTestId('q-wire')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /^No, estimate it for me/ }).click()
  await expect(page.getByTestId('wire-estimate')).toContainText('This is an estimate')
  await page.getByRole('button', { name: 'Next' }).click()
}
