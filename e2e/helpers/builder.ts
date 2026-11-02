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

/** Saved data from older visits and broken saves (PR #24 review, 2 Nov). */
const oldFridge = {
  id: 'old-fridge',
  category: 'kitchen',
  name: 'Fridge',
  watts: 150,
  qty: 1,
  surgeFactor: 3,
  dutyCycle: 0.4,
  custom: false,
}
export const OLD_SAVES: Record<string, { calc: string; build: string }> = {
  'appliance saved before the day/night split': {
    calc: JSON.stringify({ version: 1, items: [{ ...oldFridge, hoursPerDay: 24 }] }),
    build: JSON.stringify({
      version: 1,
      state: {
        step: 'items',
        items: [],
        site: {},
        installer: null,
        depositPct: 20,
        tenure: 12,
        state: 'Lagos',
        scope: 'complete',
      },
    }),
  },
  'day + night over 24 and items no longer sold': {
    calc: JSON.stringify({
      version: 1,
      items: [{ ...oldFridge, hoursPerDay: 24, dayHours: 13, nightHours: 12 }],
    }),
    build: JSON.stringify({
      version: 1,
      state: {
        step: 'summary',
        items: [{ sku: 'GONE-1', qty: 2 }],
        site: {},
        installer: 'go4solar',
        depositPct: 20,
        tenure: 12,
        state: 'Lagos',
        scope: 'complete',
      },
    }),
  },
  'broken saves': { calc: '{{not json', build: '{"version":1,"state":{"step":"rack"}}' },
}

/** Seeds the saved data, then checks /build, the home page, the calculator and the plans flow. */
export async function pagesSurviveOldSaves(
  page: Page,
  save: { calc: string; build: string },
  plansPath: string,
) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`))
  await page.goto('/privacy')
  await page.evaluate(
    ([c, b]) => {
      localStorage.setItem('g4s.calculator.v1', c)
      localStorage.setItem('g4s.builder.v1', b)
    },
    [save.calc, save.build] as const,
  )
  for (const path of ['/build', '/', '/calculate?from=build', plansPath]) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Something went wrong|Application error/)).toHaveCount(0)
  }
  await page.goto('/build')
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/went wrong/)
  expect(errors).toEqual([])
}

/** Builder → "I don't know my load" → calculator → appliances → back to the builder / plans. */
export async function builderToCalculator(page: Page) {
  await startBuilder(page)
  await skipWithoutCatalogue(page)
  await page.getByRole('button', { name: /I don't know my load/ }).click()
  await expect(page).toHaveURL(/\/calculate\?from=build/)
  await page.getByRole('button', { name: 'Lighting' }).click()
  await page.getByRole('button', { name: /^LED bulb/ }).click()
  await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
  await page.getByRole('button', { name: /^Fridge/ }).click()
  await expect(page.getByTestId('total-running')).toHaveText('160 W')
  // The chart draws a bar per category (it was an empty box with a broken saved item).
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible({ timeout: 30_000 })
}

/** Back on /build with the calculator's load in the box and a system suggested for it. */
export async function expectCalculatedLoadApplied(page: Page, kva: string) {
  await expect(page).toHaveURL(/\/build$/, { timeout: 30_000 })
  await expect(page.getByLabel('Your load (kVA)')).toHaveValue(kva)
  await expect(page.getByTestId('load-applied')).toContainText(`${kva} kVA load`, {
    timeout: 30_000,
  })
  await expect(page.getByTestId('bar-inverter')).toContainText('kVA')
  await expect(page.getByTestId('bar-battery')).not.toContainText('None in stock')
  await expect(page.getByTestId('bar-panels')).toContainText(/W/)
}

/**
 * Semako's steps (2 Nov): a system already suggested, older saved data in the browser, then
 * calculator → change hours → back → "Use my calculated load".
 */
export async function useCalculatedLoadAfterChanges(page: Page) {
  await page.goto('/privacy')
  await page.evaluate(
    (c) => localStorage.setItem('g4s.calculator.v1', c),
    OLD_SAVES['appliance saved before the day/night split']!.calc,
  )
  await startBuilder(page)
  await skipWithoutCatalogue(page)
  await page.getByRole('button', { name: 'I know my load (kVA)' }).click()
  await page.getByLabel('Your load (kVA)').fill('3')
  await page.getByRole('button', { name: 'Suggest a system' }).click()
  await expect(page.getByTestId('load-applied')).toContainText('3 kVA load', { timeout: 30_000 })
  await page.getByRole('button', { name: /I don't know my load/ }).click()
  await expect(page).toHaveURL(/\/calculate\?from=build/)
  await page.getByRole('button', { name: 'Lighting' }).click()
  await page.getByRole('button', { name: /^LED bulb/ }).click()
  await page.getByLabel('Hours in the day').first().fill('10')
  await page.getByTestId('back-to-builder').click()
  // The old fridge (150 W) + LED (10 W) = 160 W → 0.2 kVA, applied on arrival.
  await expectCalculatedLoadApplied(page, '0.2')
  // Type another load, then tap "Use my calculated load": it applies again with a message.
  await page.getByLabel('Your load (kVA)').fill('2')
  await page.getByRole('button', { name: 'Suggest a system' }).click()
  await expect(page.getByTestId('load-applied')).toContainText('2 kVA load', { timeout: 30_000 })
  await page.getByTestId('use-calculated-load').click()
  await expectCalculatedLoadApplied(page, '0.2')
}
