import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { solidPng } from './helpers/png'
import { loginAsStaff } from './helpers/staff'

config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Migration 0020 applied? (testimonials, partners and the new audit columns.) */
async function migrated(): Promise<boolean> {
  if (!url || !service) return false
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { error } = await admin.from('audit_log').select('source').limit(1)
  return !error
}

const stamp = () => Date.now().toString(36)

/** A picture of the page for the report (kept with the test results). */
const snap = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(`${name}.png`) })

async function upload(page: Page, label: RegExp, name: string, png: Buffer) {
  await page.getByLabel(label).setInputFiles({ name, mimeType: 'image/png', buffer: png })
}

/** The home page is pre-built; after a change it is rebuilt on the next visit. */
async function homeShows(page: Page, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto('/')
    await check()
  }).toPass({ timeout: 30_000 })
}

// Test rows are made by the e2e staff account (flagged is_test): local runs show them, the live
// site never does. Every row made here is deleted again at the end.
test.describe('home-page content and the permanent audit log', () => {
  // One sign-in for the group: an authenticator code works only once per 30 s window.
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  test.skip(({ isMobile }) => isMobile, 'one browser is enough')

  let context: BrowserContext
  let page: Page
  test.beforeAll(async ({ browser }) => {
    test.skip(!(await migrated()), 'needs migration 0020')
    context = await browser.newContext({ storageState: 'e2e/storage-state.json' })
    page = await context.newPage()
    await loginAsStaff(page)
  })
  test.afterAll(async () => {
    await context?.close()
  })

  test('partners: add with a logo → home row → hide → delete; all in the audit log', async () => {
    const name = `E2E Partner ${stamp()}`
    await page.goto('/admin/partners')
    await page.getByRole('button', { name: 'Add a partner' }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Website (optional)').fill('https://example.org')
    await upload(page, /^Logo/, 'logo.png', solidPng(800, 300, [46, 139, 58]))
    await expect(page.getByTestId('partner-editor').locator('img')).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Save' }).click()
    const row = page.getByTestId('partner-list').getByRole('listitem').filter({ hasText: name })
    await expect(row).toContainText('Showing', { timeout: 20_000 })
    await snap(page, 'admin-partners')

    await homeShows(page, async () => {
      const logo = page.getByTestId('partner-logos').getByRole('img', { name })
      await expect(logo).toBeVisible()
      await page.getByTestId('partner-logos').scrollIntoViewIfNeeded()
      await snap(page, 'home-partners')
      await expect(
        page.getByRole('link', { name: `${name} (opens in a new tab)` }),
      ).toHaveAttribute('target', '_blank')
    })

    await page.goto('/admin/partners')
    await row.getByRole('button', { name: 'Hide' }).click()
    await expect(row).toContainText('Hidden', { timeout: 20_000 })
    await homeShows(page, async () => {
      await expect(page.getByText(name)).toHaveCount(0)
    })

    await page.goto('/admin/partners')
    page.once('dialog', (d) => d.accept())
    await row.getByRole('button', { name: 'Delete' }).click()
    await expect(row).toHaveCount(0, { timeout: 20_000 })

    // The audit log has the add, the change and the delete, by the e2e staff member.
    await page.goto('/admin/audit?table=partners')
    const table = page.getByTestId('audit-table')
    await expect(table).toContainText('Added to partners')
    await expect(table).toContainText('Changed partners')
    await expect(table).toContainText('Deleted from partners')
    await expect(table).toContainText(process.env.E2E_STAFF_EMAIL!)
    await expect(table.getByRole('button')).toHaveCount(0) // nothing can be edited or deleted
    await snap(page, 'admin-audit')
  })

  test('testimonials: consent before publishing → home carousel → delete', async () => {
    const quote = `E2E quote ${stamp()}: quiet nights at last.`
    await page.goto('/admin/testimonials')
    await page.getByRole('button', { name: 'Add a testimonial' }).click()
    await page.getByLabel('Client first name').fill('Amaka')
    await page.getByLabel('City', { exact: true }).fill('Ikeja')
    await page.getByLabel(/System size/).fill('3.5 kVA · 7.5 kWh')
    await page.getByLabel('Installer name', { exact: true }).fill('Musa Bello')
    await page.getByLabel('Client quote').fill(quote)
    await upload(page, /^Installer photo/, 'face.png', solidPng(600, 900, [27, 78, 155]))
    await upload(page, /^Job photo/, 'job.png', solidPng(1600, 1000, [244, 123, 32]))
    await expect(page.getByTestId('testimonial-editor').locator('img')).toHaveCount(2, {
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Save' }).click()

    const item = page
      .getByTestId('testimonial-list')
      .getByRole('listitem')
      .filter({ hasText: quote })
    await expect(item).toContainText('Not published', { timeout: 20_000 })
    // No consent ticks yet: publishing is not possible.
    await expect(item.getByRole('button', { name: 'Publish' })).toBeDisabled()
    await snap(page, 'admin-testimonials-no-consent')

    await item.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('checkbox', { name: /client agreed/ }).check()
    await page.getByRole('checkbox', { name: /installer agreed/ }).check()
    await page.getByRole('button', { name: 'Save' }).click()
    await item.getByRole('button', { name: 'Publish' }).click()
    await expect(item).toContainText('Published', { timeout: 20_000 })

    await homeShows(page, async () => {
      const carousel = page.getByRole('region', { name: 'What our customers say' })
      await expect(carousel)
        .toContainText(quote, { timeout: 2_000 })
        .catch(async () => {
          // Other test stories may be showing first: step through the dots.
          for (const dot of await carousel
            .getByRole('button', { name: /Show testimonial/ })
            .all()) {
            await dot.click()
            if ((await carousel.textContent())?.includes(quote)) return
          }
          throw new Error('quote not in the carousel')
        })
      await page.getByRole('region', { name: 'What our customers say' }).scrollIntoViewIfNeeded()
      await snap(page, 'home-carousel')
    })

    await page.goto('/admin/testimonials')
    page.once('dialog', (d) => d.accept())
    await item.getByRole('button', { name: 'Delete' }).click()
    await expect(item).toHaveCount(0, { timeout: 20_000 })
  })

  test('staff sign-ins are recorded and the log downloads as CSV', async () => {
    await page.goto('/admin/audit?action=auth.')
    await expect(page.getByTestId('audit-table')).toContainText('Signed in')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('audit-csv').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^go4solar-audit-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

test('home page: no testimonials or partner sections appear empty', async ({ page }) => {
  await page.goto('/')
  // Whatever is published, an empty section is never shown.
  for (const id of ['testimonials', 'partner-logos']) {
    const section = page.getByTestId(id)
    if ((await section.count()) > 0)
      await expect(
        section
          .getByRole('img')
          .or(section.getByRole('blockquote'))
          .or(section.getByRole('listitem'))
          .first(),
      ).toBeVisible()
  }
})
