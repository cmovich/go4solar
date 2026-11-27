import { expect, type Page } from '@playwright/test'

/**
 * Installation and delivery rule + question order + deposit slider (Semako, 26 Nov 2026), from
 * saved progress at "Choose your items" with exactly these items (the cheapest active
 * inverter, battery and panel in the live price list).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function cheapestSkus(): Promise<{
  inverter: string
  battery: string
  panel: string
}> {
  const res = await fetch(
    `${url}/rest/v1/components?select=sku,category,unit_cost&active=eq.true&category=in.(inverter,battery,panels)&order=unit_cost`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  const rows = (await res.json()) as { sku: string; category: string }[]
  const first = (c: string) => rows.find((r) => r.category === c)!.sku
  return { inverter: first('inverter'), battery: first('battery'), panel: first('panels') }
}

export async function openItems(page: Page, items: { sku: string; qty: number }[]) {
  await page.goto('/privacy')
  await page.evaluate((list) => {
    localStorage.removeItem('g4s.calculator.v1')
    localStorage.setItem(
      'g4s.builder.v1',
      JSON.stringify({
        version: 1,
        state: {
          step: 'items',
          items: list,
          site: {},
          installer: null,
          depositPct: 20,
          tenure: 12,
          state: 'Kaduna',
          scope: 'some',
          applicantType: 'individual',
        },
      }),
    )
  }, items)
  await page.goto('/build')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose your items', {
    timeout: 30_000,
  })
  const next = page.getByRole('button', { name: 'Next', exact: true })
  await expect(next).toBeEnabled({ timeout: 30_000 })
  await next.click()
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 })

async function openBreakdown(page: Page) {
  await expect(page.getByTestId('price-bar')).toContainText('Total payable', { timeout: 30_000 })
  if (!(await page.getByTestId('price-breakdown').isVisible())) {
    await page.getByTestId('see-breakdown').click()
  }
  await expect(page.getByTestId('price-breakdown')).toBeVisible()
}

/** 1. One type of product: straight to the price; no installation, delivery or pack. */
export async function singleItemHasNoService(page: Page, sku: string) {
  await openItems(page, [{ sku, qty: 1 }])
  await expect(heading(page)).toHaveText('Your system and payment plan', { timeout: 30_000 })
  await openBreakdown(page)
  await expect(page.getByTestId('bd-installation')).toHaveText('Installation: not included')
  await expect(page.getByTestId('bd-delivery')).toHaveText('Delivery: not included')
  await expect(page.getByTestId('bd-include-installation')).toHaveCount(0)
  await expect(page.getByTestId('bd-include-delivery')).toHaveCount(0)
  await expect(page.getByTestId('bd-item-list')).not.toContainText(/Protection, cables/)
  await expect(page.getByTestId('build-summary')).not.toContainText(/Installation|Delivery —/)
}

async function answerService(page: Page, install: 'yes' | 'no', deliver: 'yes' | 'no') {
  await expect(heading(page)).toHaveText('Installation and delivery', { timeout: 30_000 })
  const installer = page.getByRole('group', { name: /recognised installer/ })
  const delivery = page.getByRole('group', { name: 'Should we deliver it?' })
  await installer
    .getByRole('button', { name: install === 'yes' ? /^Yes/ : /^No — I'll arrange my own/ })
    .click()
  await delivery
    .getByRole('button', { name: deliver === 'yes' ? /^Yes/ : /^No — I'll collect/ })
    .click()
  await page.getByRole('button', { name: 'Continue' }).click()
}

/** 2. Inverter + battery: asked first; no mounting or roof questions; ticks follow the answers. */
export async function systemWithoutPanels(page: Page, skus: { inverter: string; battery: string }) {
  await openItems(page, [
    { sku: skus.inverter, qty: 1 },
    { sku: skus.battery, qty: 1 },
  ])
  await answerService(page, 'yes', 'yes')
  await expect(heading(page)).toHaveText('Do you know the length of wire needed?')
  await page.getByRole('button', { name: /^No, estimate it for me/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(heading(page)).toHaveText('Your system and payment plan', { timeout: 30_000 })
  await openBreakdown(page)
  await expect(page.getByTestId('bd-installation')).toHaveText('Installation: included', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('bd-delivery')).toHaveText('Delivery: included')
  // The ticks change the answer: untick installation → not included.
  await page.getByTestId('bd-include-installation').click()
  await expect(page.getByTestId('bd-installation')).toHaveText('Installation: not included', {
    timeout: 15_000,
  })
  await page.getByTestId('bd-include-delivery').click()
  await expect(page.getByTestId('bd-delivery')).toHaveText('Delivery: not included', {
    timeout: 15_000,
  })
  // Back goes wire → installation and delivery (no mounting screens on the way).
  await closeBreakdown(page)
  await page.getByRole('button', { name: /Back/ }).click()
  await expect(heading(page)).toHaveText('Do you know the length of wire needed?')
  await page.getByRole('button', { name: /Back/ }).click()
  await expect(heading(page)).toHaveText('Installation and delivery')
}

/** 3. Inverter + 2 panels: mounting first; not a roof → no roof questions. */
export async function panelsOffTheRoof(page: Page, skus: { inverter: string; panel: string }) {
  await openItems(page, [
    { sku: skus.inverter, qty: 1 },
    { sku: skus.panel, qty: 2 },
  ])
  await answerService(page, 'no', 'no')
  await expect(heading(page)).toHaveText('Where should the panels be mounted?')
  await page.getByRole('button', { name: /^Ground/ }).click()
  await expect(heading(page)).toHaveText('Do you know the length of wire needed?')
  await page.getByRole('button', { name: /^No, estimate it for me/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(heading(page)).toHaveText('Your system and payment plan', { timeout: 30_000 })
  await openBreakdown(page)
  await expect(page.getByTestId('bd-installation')).toHaveText('Installation: not included')
  await expect(page.getByTestId('bd-delivery')).toHaveText('Delivery: not included')
  // Roof: the roof type is asked only then.
  await closeBreakdown(page)
  await page.getByRole('button', { name: /Back/ }).click()
  await page.getByRole('button', { name: /Back/ }).click()
  await expect(heading(page)).toHaveText('Where should the panels be mounted?')
  await page.getByRole('button', { name: /^Roof/ }).click()
  await expect(heading(page)).toHaveText('What type of roof do you have?')
}

/** On phones the open breakdown covers the page: close it before using Back. */
async function closeBreakdown(page: Page) {
  if (await page.getByTestId('price-breakdown').isVisible()) {
    await page.getByTestId('see-breakdown').click()
    await expect(page.getByTestId('price-breakdown')).toBeHidden()
  }
}

const naira = (t: string | null) => Number((t ?? '').replace(/[^0-9]/g, ''))

/** 4. The slider and "See breakdown" always show the same deposit, even after quick moves. */
export async function sliderMatchesBreakdown(page: Page, sku: string) {
  await openItems(page, [{ sku, qty: 1 }])
  await openBreakdown(page)
  const at20 = naira(await page.getByTestId('bd-deposit').textContent())
  const slider = page.getByTestId('price-breakdown').getByRole('slider')
  await slider.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight') // 35%
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowLeft') // 25%
  await expect(page.getByTestId('bd-deposit-pct')).toHaveText('25%')
  const bd = page.getByTestId('price-breakdown')
  await expect(bd).toContainText('Deposit (25%)')
  await expect(bd).not.toContainText('Deposit (35%)')
  await expect(page.getByTestId('bd-deposit')).not.toHaveText('Updating…', { timeout: 15_000 })
  await expect(page.getByTestId('build-deposit-pct')).toHaveText('25%')
  const at25 = naira(await page.getByTestId('bd-deposit').textContent())
  // The deposit is that share of the same price: 25% ÷ 20% of the 20% deposit (±₦5 rounding).
  expect(Math.abs(at25 - (at20 * 25) / 20)).toBeLessThanOrEqual(5)
  expect(naira(await page.getByTestId('build-deposit-amount').textContent())).toBe(at25)
}
