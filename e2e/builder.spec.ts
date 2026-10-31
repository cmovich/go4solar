import { expect, test } from '@playwright/test'

import {
  buildFromLoad,
  fillBuildContact,
  skipWithoutCatalogue,
  startBuilder,
} from './helpers/builder'

/** Part F (prelaunch): the system builder from "Get started". */
test.describe('system builder', () => {
  test.setTimeout(180_000)

  test('Get started opens the builder', async ({ page }) => {
    await page.goto('/')
    await page
      .getByTestId('cta-hero')
      .getByRole('link', { name: /Get started/ })
      .click()
    await expect(page).toHaveURL(/\/build$/)
  })

  test('known load → suggested system → questions → submit', async ({ page }) => {
    await startBuilder(page)
    await buildFromLoad(page)
    await fillBuildContact(page)
    await page.getByTestId('build-submit').click()
    await expect(page.getByTestId('build-done')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('build-done')).toContainText('Thank you!')
  })

  test('just some items asks what they already have', async ({ page }) => {
    await startBuilder(page, 'some')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'What inverter or battery do you already have?',
    )
  })

  test('"I don\'t know my load" goes to the calculator and the builder is kept', async ({
    page,
  }) => {
    await startBuilder(page)
    await skipWithoutCatalogue(page)
    await page.getByRole('button', { name: /I don't know my load/ }).click()
    await expect(page).toHaveURL(/\/calculate\?from=build/)
    const saved = await page.evaluate(() => window.localStorage.getItem('g4s.builder.v1'))
    expect(saved).toContain('"state":"Lagos"')
  })
})
