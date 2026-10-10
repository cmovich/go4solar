import { expect, test } from '@playwright/test'

test.describe('landing page', () => {
  test('hero copy is visible and the button leads to the calculator', async ({ page }) => {
    await page.goto('/')

    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toBeVisible()
    await expect(h1).toContainText('Solar on monthly payments.')
    await expect(h1).toContainText('Zero interest.')

    await expect(
      page.getByText('We import directly from the manufacturers, so you pay less upfront'),
    ).toBeVisible()
    await expect(
      page.getByText('20+ homes and businesses financed · ~1 MW installed'),
    ).toBeVisible()

    const cta = page.getByRole('link', { name: 'Calculate my load' })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/calculate')

    // The example-plan card is desktop only; phones rely on the badges.
    const card = page.getByText('Comfort plan')
    if (test.info().project.name === 'mobile') await expect(card).toBeHidden()
    else await expect(card).toBeVisible()
  })

  test('has every section in order and the partner links', async ({ page }) => {
    await page.goto('/')
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents()
    expect(headings).toEqual([
      'From appliances to installed solar in four steps',
      'A generator costs you every month, forever',
      '20+ homes and businesses already financed',
      'Grow with Go4Solar',
      'Questions people ask before they start',
    ])
    await expect(page.getByRole('link', { name: 'Become a partner installer' })).toHaveAttribute(
      'href',
      '/partners/installer',
    )
    await expect(page.getByRole('link', { name: 'Become a verified vendor' })).toHaveAttribute(
      'href',
      '/partners/vendor',
    )
    // Track-record tiles
    await expect(page.getByText('₦30M+')).toBeVisible()
    await expect(page.getByText('in solar financing')).toBeVisible()
  })

  test('savings example shows the total amount payable beside 0% interest', async ({ page }) => {
    await page.goto('/')
    const savings = page.locator('section', { hasText: 'Savings comparison' })
    await expect(savings.getByText('Example', { exact: true })).toBeVisible()
    await expect(savings.getByText('₦165,017').first()).toBeVisible()
    await expect(savings.getByText('₦2,475,248')).toBeVisible()
    await expect(page.getByText('Over 2 years: ₦4,320,000 — and it keeps going.')).toBeVisible()
    await expect(
      page.getByText('Over 2 years you save ₦1,844,752 — and you own the system.'),
    ).toBeVisible()
  })

  test('FAQ opens and mentions the late fee', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'What happens if I miss a payment?' }).click()
    await expect(
      page.getByText('If a payment is more than 14 days late the system can be locked'),
    ).toBeVisible()
  })

  test('renders without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))
    // Name any failing request, so a 404 (e.g. a prefetch of a missing route) is obvious.
    page.on('response', (res) => {
      if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`)
    })
    await page.goto('/')
    await page.waitForLoadState('load')
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  })
})
