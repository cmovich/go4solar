import { expect, test, type Page } from '@playwright/test'

import { testEmail, testPhone } from './test-identity'

/**
 * Part F: the system builder (/build). Skips the calling test until migration 0027 (the
 * catalogue) is applied: before it the builder has no items to choose from.
 */
export async function startBuilder(page: Page, scope: 'complete' | 'some' = 'complete') {
  await page.goto('/build')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Do you want a complete system financed, or just some items?',
  )
  await page.getByLabel('Where will it be installed?').selectOption('Lagos')
  await page
    .getByRole('button', { name: scope === 'complete' ? /^A complete system/ : /^Just some items/ })
    .click()
}

export async function skipWithoutCatalogue(page: Page) {
  await expect(page.getByTestId('load-panel')).toBeVisible({ timeout: 30_000 })
  const empty = (await page.getByTestId('bar-inverter').textContent())?.includes('None in stock')
  test.skip(empty !== false, 'Builder catalogue not set up yet (migration 0027 not applied)')
}

/** "I know my load" → suggested system → the site questions → installer → summary. */
export async function buildFromLoad(page: Page, kva = '3') {
  await skipWithoutCatalogue(page)
  await page.getByRole('button', { name: 'I know my load (kVA)' }).click()
  await page.getByLabel('Your load (kVA)').fill(kva)
  await page.getByRole('button', { name: 'Suggest a system' }).click()
  await expect(page.getByTestId('bar-inverter')).toContainText('kVA', { timeout: 30_000 })
  const next = page.getByRole('button', { name: 'Next', exact: true })
  await expect(next).toBeEnabled({ timeout: 30_000 })
  await next.click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Where should the panels be mounted?',
  )
  await page.getByRole('button', { name: /^Roof/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What type of roof do you have?')
  const cards = page.getByTestId('roof-card')
  if ((await cards.count()) > 0) await cards.first().click()
  else await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Do you want a roofing rack?')
  await page.getByRole('button', { name: /^Yes/ }).click()
  await page.getByRole('button', { name: 'Aluminium' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How tall is the building?')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Do you know the length of wire needed?',
  )
  await page.getByRole('button', { name: /^No, estimate it for me/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who will install it?')
  await page.getByRole('button', { name: /^My own installer/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'not liable' })).toBeVisible()
  await page.getByRole('button', { name: /^Go4Solar recognised installer/ }).click()
  await page.getByRole('button', { name: 'See my price' }).click()
  await expect(page.getByTestId('build-summary')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('build-summary')).toContainText('Delivery — Go4Solar logistics')
}

export async function fillBuildContact(page: Page) {
  await page.getByLabel('First name', { exact: true }).fill('Builder')
  await page.getByLabel('Surname', { exact: true }).fill(`Test${Date.now() % 100000}`)
  await page.getByLabel('Phone number', { exact: true }).fill(testPhone())
  await page.getByLabel('Email address', { exact: true }).fill(testEmail('build'))
  await page.getByLabel('Local government area', { exact: true }).fill('Ikeja')
  await page.getByRole('checkbox', { name: /may contact me about this system/ }).check()
}
