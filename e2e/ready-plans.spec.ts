import { expect, test } from '@playwright/test'

import { ownConnection } from './helpers/connection'
import { chooseAndAccept, PLAN_ORDER, readyPlansMigrated, RELAX_MAX } from './helpers/readyPlans'
import { loginAsStaff } from './helpers/staff'

/**
 * Ready-made plans (prelaunch). The plans are SAMPLE until Semako confirms them, so customer pages
 * show no naira; the figures are unit-tested (src/lib/readyPlans/price.test.ts) and read here from
 * the admin preview. Nothing in the price list is saved by these tests.
 */
test.beforeEach(async ({ context }) => {
  await ownConnection(context)
  test.skip(!(await readyPlansMigrated()), 'migration 0034 not applied yet')
})

test.describe('ready-made plans', () => {
  test.setTimeout(180_000)

  test('home page: six plans after the hero, smallest first; swipe on phones, grid on desktop', async ({
    page,
  }) => {
    await page.goto('/')
    const section = page.getByTestId('ready-plans')
    await expect(section).toBeVisible()
    const cards = section.locator('article[data-testid^="ready-plan-"]')
    const maxShown = (await page.getByTestId(`ready-plan-${RELAX_MAX}`).count()) > 0
    const expected = maxShown ? [...PLAN_ORDER, RELAX_MAX] : PLAN_ORDER
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(
      expected.map((s) => `ready-plan-${s}`),
    )
    await expect(section.getByTestId('ready-plans-note')).toHaveText(
      'Prices for Kaduna. Delivery to other states is paid by the customer.',
    )
    // Every card starts with its plan picture, and the pictures really load (4:3 WebP).
    const pictures = cards.locator('img')
    await expect(pictures).toHaveCount(expected.length)
    for (const img of await pictures.all()) {
      await img.scrollIntoViewIfNeeded()
      await expect(img).toHaveAttribute('src', /\/site-media\/plan\/.+\.webp$/)
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)
    }
    // The voltage tag on every card; Relax is the 48 V system.
    await expect(page.getByTestId('ready-plan-relax')).toContainText('48 V system')
    await expect(page.getByTestId('ready-plan-no-wahala')).toContainText('24 V system')
    // Relax Max (7th plan): switched off → no card and its page is not found. Once switched on:
    // 48 V, after Relax (checked above), Relax's photo for now, and no naira while SAMPLE.
    if (maxShown) {
      const max = page.getByTestId(`ready-plan-${RELAX_MAX}`)
      await expect(max).toContainText('48 V system')
      await expect(max.locator('img')).toHaveAttribute(
        'src',
        (await page.getByTestId('ready-plan-relax').locator('img').getAttribute('src'))!,
      )
      if ((await max.getByTestId('card-price').count()) === 0) {
        await expect(max).not.toContainText('₦')
      }
    } else {
      expect((await page.request.get(`/plans/${RELAX_MAX}`)).status()).toBe(404)
    }
    // Confirmed prices: deposit and the 12-month payment (I Pass My Neighbour: ₦93,000, then
    // ₦49,600). SAMPLE: no naira at all. Never the word "interest".
    const neighbour = page.getByTestId('ready-plan-i-pass-my-neighbour')
    if ((await neighbour.getByTestId('card-price').count()) > 0) {
      await expect(neighbour.getByTestId('card-price')).toContainText('Deposit ₦93,000')
      await expect(neighbour.getByTestId('card-price')).toContainText(
        'then ₦49,600/month for 12 months',
      )
      await expect(page.getByTestId('ready-plan-relax').getByTestId('card-price')).toContainText(
        'Deposit ₦684,000',
      )
    } else {
      await expect(section).not.toContainText('₦')
    }
    await expect(section).not.toContainText(/interest/i)
    // Section order: straight after the hero.
    const order = await page
      .locator('main > section')
      .evaluateAll((els) => els.map((e) => e.id || e.getAttribute('data-testid') || ''))
    expect(order.indexOf('ready-plans')).toBe(1)
    const list = section.getByTestId('ready-plans-list')
    const scrolls = await list.evaluate((el) => el.scrollWidth > el.clientWidth + 10)
    expect(scrolls).toBe(test.info().project.name === 'mobile')
    // Anyone who can't find a plan: calculator and builder.
    await expect(section.getByRole('link', { name: 'Calculate my load' })).toBeVisible()
  })

  test('plan page: items without prices, what it powers, backup note, months and state', async ({
    page,
  }) => {
    await page.goto('/plans/oga-boss')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oga Boss')
    const picture = page.locator('main img').first()
    await expect(picture).toHaveAttribute('src', /\/site-media\/plan\/oga-boss-.+\.webp$/)
    await expect
      .poll(() => picture.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    await expect(page.getByText('12 V system')).toBeVisible()
    const included = page.getByTestId('plan-included')
    await expect(included).toContainText('Battery · 3.6 kWh lithium-ion 12 V')
    await expect(included).toContainText('Inverter · 2 kVA 12 V')
    await expect(included).not.toContainText('₦')
    await expect(page.getByTestId('plan-can-power')).toContainText('0.5 HP water pump at times')
    await expect(
      page.getByText('Estimates — depends on how many items are on at once.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '6 months' })).toBeVisible()
    await expect(page.getByRole('button', { name: '9 months' })).toBeVisible()
    await expect(page.getByRole('button', { name: '12 months' })).toBeVisible()
    if ((await page.getByTestId('plan-figures').count()) > 0) {
      // Confirmed prices (Oga Boss): 12 months by default, then 6; pay in full; Lagos delivery.
      await expect(page.getByTestId('plan-deposit')).toHaveText('₦261,400')
      await expect(page.getByTestId('plan-monthly')).toHaveText('₦139,413 × 12 months')
      await expect(page.getByTestId('plan-full')).toHaveText('₦1,450,770 (25% off)')
      await page.getByRole('button', { name: '6 months' }).click()
      await expect(page.getByTestId('plan-monthly')).toHaveText('₦226,547 × 6 months')
      await expect(page.getByText('One fixed price. No hidden charges.')).toBeVisible()
      await page.getByLabel('Where will it be installed?').selectOption('Lagos')
      await expect(page.getByTestId('plan-extra-delivery')).toContainText(
        'Delivery to Lagos (extra, paid with the deposit)',
      )
    } else {
      await expect(page.getByTestId('plan-price-later')).toBeVisible()
    }
    await expect(page.locator('main')).not.toContainText(/interest|vendor/i)
    await expect(page.locator('main')).not.toContainText('admin')
    await expect(page.getByText(/Charge controller must be|needs ~130 A/)).toHaveCount(0)
    await expect(page.getByText('Subject to a site check.')).toBeVisible()
  })

  test('Choose this plan → questions → quotation → Accept and apply → thank-you', async ({
    page,
  }) => {
    await chooseAndAccept(page, 'level-up')
    await expect(page.getByTestId('accepted')).toContainText('Thank you!', { timeout: 45_000 })
  })

  test('Pay in full: one price on the plan page, the quotation, then the sign-up', async ({
    page,
  }) => {
    await page.goto('/plans/oga-boss')
    await page.getByTestId('choose-full').click()
    if ((await page.getByTestId('plan-figures-full').count()) > 0) {
      await expect(page.getByTestId('plan-full-total')).toHaveText('₦1,450,770')
      await expect(page.getByTestId('plan-figures-full')).not.toContainText(/a month|deposit/i)
    }
    await chooseAndAccept(page, 'oga-boss', { payInFull: true })
    await expect(page.getByTestId('accepted')).toContainText('Thank you!', { timeout: 45_000 })
  })

  test('Customise this plan → the builder with a system suggested for the plan', async ({
    page,
  }) => {
    await page.goto('/plans/oga-boss')
    await page.getByTestId('customise-plan').click()
    await expect(page).toHaveURL(/\/build\?ready=oga-boss&state=Kaduna/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose your items', {
      timeout: 30_000,
    })
    await expect(page.getByTestId('bar-inverter')).toContainText('kVA', { timeout: 30_000 })
  })

  test('a plan that does not exist: not found', async ({ page }) => {
    const res = await page.goto('/plans/no-such-plan')
    expect(res?.status()).toBe(404)
  })
})

test.describe('ready-made plans: staff', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name === 'mobile', 'one browser is enough')
  })

  test('admin: seven plans (Relax Max last), staff notes; the editor preview shows the exact figures', async ({
    page,
  }) => {
    test.skip(!process.env.E2E_STAFF_EMAIL, 'needs the e2e staff account')
    await loginAsStaff(page)
    await page.goto('/admin/pricing/ready-plans')
    const rows = page.getByTestId('ready-plan-row')
    await expect(rows).toHaveCount(7)
    // A picture per plan, and a replace field in the editor.
    await expect(page.getByTestId('plan-thumb')).toHaveCount(7)
    await expect(rows.first()).toContainText('Charge controller must be ≥30 A.')
    await expect(rows.nth(2)).toContainText('needs ~130 A charging')
    // I Pass My Neighbour: ₦93,000 deposit, ₦49,600 a month, pay in full ₦516,150.
    await expect(rows.first()).toContainText('₦93,000 / ₦49,600')
    await rows.first().getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByText('Picture (saved; choose another to replace)')).toBeVisible()
    const preview = page.getByTestId('plan-preview')
    await expect(preview).toContainText('6 months: deposit ₦93,000, then ₦80,600 a month')
    await expect(preview).toContainText('9 months: deposit ₦93,000, then ₦59,933 a month')
    await expect(preview).toContainText('Pay in full: ₦516,150 (25% off)')
    // Cancel: nothing saved.
    await page.getByRole('button', { name: 'Cancel' }).first().click()
    // Relax Max (added switched off): its staff note and Semako's figures.
    const max = rows.nth(6)
    await expect(max).toContainText('Relax Max')
    await expect(max).toContainText("Check the inverter's max PV input ≥ 11.7 kW.")
    await expect(max).toContainText('₦1,216,400 / ₦648,747')
    await max.getByRole('button', { name: 'Edit' }).click()
    await expect(preview).toContainText('6 months: deposit ₦1,216,400, then ₦1,054,213 a month')
    await expect(preview).toContainText('9 months: deposit ₦1,216,400, then ₦783,902 a month')
    await expect(preview).toContainText('Pay in full: ₦7,201,088 (20% off)')
    await page.getByRole('button', { name: 'Cancel' }).first().click()
  })

  test('staff quotation tool: Start from a ready-made plan', async ({ page }) => {
    test.skip(!process.env.E2E_STAFF_EMAIL, 'needs the e2e staff account')
    await loginAsStaff(page)
    await page.goto('/admin/quotations/new')
    await page.getByLabel('State', { exact: true }).selectOption('Kaduna')
    const box = page.getByTestId('start-from-plan')
    await box.getByLabel('Plan').selectOption('relax')
    await box.getByLabel('Months').selectOption('9')
    await box.getByTestId('create-from-plan').click()
    await page.waitForURL(/\/admin\/quotations\/[0-9a-f-]{36}$/, { timeout: 45_000 })
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Quotation')
    await expect(
      page.getByTestId('quotation').or(page.getByTestId('quotation-sample')),
    ).toBeVisible()
  })
})
