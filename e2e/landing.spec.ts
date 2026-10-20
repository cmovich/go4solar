import { expect, test, type Page } from '@playwright/test'

/** True when the page shows the SAMPLE-price version (no naira amounts). */
async function samplePrices(page: Page): Promise<boolean> {
  return (await page.getByTestId('hero-total').innerText()).includes(
    'confirmed when we contact you',
  )
}

test.describe('landing page', () => {
  test('hero copy is visible and the button leads to the calculator', async ({ page }) => {
    await page.goto('/')

    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toBeVisible()
    // While any price is a SAMPLE price the hero makes no interest claim (no total is shown).
    const total = page.getByTestId('hero-total')
    await expect(total).toBeVisible() // directly under the explainer, on phones and desktop
    if (await samplePrices(page)) {
      await expect(h1).toHaveText('Go 4 Solar, Pay Easy')
      await expect(
        page.getByText('Starting from 20% deposit. You get your solar installed.', { exact: true }),
      ).toBeVisible()
      await expect(page.getByText(/no interest/i)).toHaveCount(0)
    } else {
      await expect(h1).toHaveText('Go 4 Solar, Pay Easy, No Interest')
      await expect(
        page.getByText(
          'Starting from 20% deposit. You get your solar installed, no interest attached.',
        ),
      ).toBeVisible()
      await expect(total).toContainText('total amount payable ₦')
    }
    // The headline fits a 375 px phone without sideways scrolling.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflow).toBe(false)
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
    const all = await page.getByRole('heading', { level: 2 }).allTextContents()
    const sample = await samplePrices(page)
    // Customer stories and partner logos appear only when staff have published some.
    const dataDriven = ['What our customers say', 'Our partners']
    expect(all.filter((h) => !dataDriven.includes(h))).toEqual([
      'From appliances to installed solar in four steps',
      // The Savings comparison (naira amounts) is hidden while prices are SAMPLE prices.
      ...(sample ? [] : ['A generator costs you every month, forever']),
      '20+ homes and businesses already financed',
      'Grow with Go4Solar',
      'Questions people ask before they start',
    ])
    // When shown: stories after the track record, partner logos after "Grow with Go4Solar".
    const at = (h: string) => all.indexOf(h)
    if (at('What our customers say') >= 0)
      expect(at('What our customers say')).toBe(at('20+ homes and businesses already financed') + 1)
    if (at('Our partners') >= 0) expect(at('Our partners')).toBe(at('Grow with Go4Solar') + 1)
    await expect(page.getByRole('link', { name: 'Become a partner installer' })).toHaveAttribute(
      'href',
      '/partners/installer',
    )
    // Prelaunch: the vendor sign-up opens at launch, so its button is hidden.
    await expect(page.getByRole('link', { name: 'Become a verified vendor' })).toHaveCount(0)
    // Track-record tiles
    await expect(page.getByText('₦30M+')).toBeVisible()
    await expect(page.getByText('in solar financing')).toBeVisible()
    await expect(page.getByText('₦300M+')).toBeVisible()
    await expect(page.getByText('worth of installations')).toBeVisible()
    // Nationwide: no three-state wording anywhere on the page.
    await expect(page.getByText(/Abuja|Kaduna|3 states/)).toHaveCount(0)
    await expect(page.getByText('Serving homes and businesses across Nigeria.')).toBeVisible()
  })

  test('savings example shows the total amount payable beside 0% interest', async ({ page }) => {
    await page.goto('/')
    if (await samplePrices(page)) {
      // Prompt 16A safety net: no naira amounts while prices are SAMPLE prices.
      await expect(page.locator('section', { hasText: 'Savings comparison' })).toHaveCount(0)
      await expect(page.getByTestId('hero-total')).toHaveText(
        'Your exact price will be confirmed when we contact you.',
      )
      return
    }
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
      page.getByText('If a payment is 7 days overdue the system can be locked'),
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

test('the hero headline fits a 375 px phone (no sideways scroll, no cut-off words)', async ({
  browser,
}) => {
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    storageState: 'e2e/storage-state.json',
  })
  await page.goto('/')
  const h1 = page.getByRole('heading', { level: 1 })
  await expect(h1).toBeVisible()
  const box = await h1.boundingBox()
  expect(box!.width).toBeLessThanOrEqual(375 - 16 * 2 + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({ path: test.info().outputPath('hero-375.png') })
  // Every track-record figure fits inside its tile.
  for (const value of ['20+', '₦30M+', '₦300M+', '~1 MW']) {
    const fits = await page.getByText(value, { exact: true }).evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const text = range.getBoundingClientRect()
      const tile = el.parentElement!.getBoundingClientRect()
      return text.right <= tile.right - 8 // stays inside the tile, clear of its edge
    })
    expect(fits, value).toBe(true)
  }
  await page.close()
})

test('hero photos: one loads with the page, small enough for slow phones; the rest come later', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const backdrop = page.locator('[data-slide]')
  await expect(backdrop.first()).toBeAttached()
  await page.waitForLoadState('load')
  // After loading, all photos are on the page (each crossfades in turn).
  await expect(backdrop).toHaveCount(4, { timeout: 5000 })
  const sizes = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => r.name.includes('/_next/image') && r.name.includes('hero-1-'))
      .map((r) => (r as PerformanceResourceTiming).transferSize),
  )
  // The first photo is served as WebP/AVIF sized to the screen: well under 150 KB.
  for (const bytes of sizes) expect(bytes).toBeLessThan(150 * 1024)
})

test('hero photos: reduced motion shows the first photo only', async ({ browser }) => {
  const page = await browser.newPage({
    reducedMotion: 'reduce',
    storageState: 'e2e/storage-state.json',
  })
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(7000)
  await expect(page.locator('[data-slide]')).toHaveCount(1)
  await page.close()
})
