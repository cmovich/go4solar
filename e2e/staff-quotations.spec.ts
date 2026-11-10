import { expect, test } from '@playwright/test'

import { ownConnection } from './helpers/connection'
import { openPdf } from './helpers/invoices'
import { loginAsStaff } from './helpers/staff'
import { createQuotationAsStaff, staffQuotesMigrated } from './helpers/staffQuotes'
import { testEmail, testPhone, toE164 } from './helpers/test-identity'

const hasStaff = () => Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_TOTP_SECRET)

/** Staff quotation tool (prelaunch): create → share → the customer accepts on the link. */
test.describe('staff quotations', () => {
  test.beforeEach(async ({ context }) => ownConnection(context))

  test('super admin: create, share on WhatsApp, PDF, list; the customer accepts', async ({
    page,
    browser,
  }) => {
    test.skip(!hasStaff(), 'needs the e2e staff account')
    test.skip(test.info().project.name === 'mobile', 'one browser is enough for the staff side')
    test.skip(!(await staffQuotesMigrated()), 'migration 0032 not applied yet')
    await loginAsStaff(page)
    const name = `Quote Test${Date.now() % 100000}`
    const phone = testPhone()
    const { adminUrl, link } = await createQuotationAsStaff(page, { name, phone })

    // Share on WhatsApp: straight to the customer's chat with the total, monthly and the link.
    const share = page.getByTestId('share-whatsapp')
    const href = (await share.getAttribute('href'))!
    expect(href).toContain(`https://wa.me/${toE164(phone).slice(1)}?text=`)
    const text = decodeURIComponent(href.split('?text=')[1]!)
    expect(text).toContain(`Hello ${name.split(' ')[0]}`)
    expect(text).toContain(link)
    const sample = (await page.getByTestId('quotation-sample').count()) > 0
    if (sample) expect(text).not.toContain('₦')
    else {
      expect(text).toMatch(/Total amount payable: ₦[\d,]+/)
      expect(text).toMatch(/₦[\d,]+ a month for \d+ months/)
      const pdf = await openPdf(
        page.request,
        (await page.getByTestId('quotation-pdf').getAttribute('href'))!,
        'quotation',
      )
      await expect(page.getByTestId('quotation')).toContainText(pdf.number)
      await expect(page.getByTestId('quotation')).toContainText(name)
    }
    await page.getByTestId('copy-link').click()
    await expect(async () => {
      await page.reload()
      await expect(page.getByTestId('quotation-status')).toContainText('Shared')
    }).toPass({ timeout: 30_000 })

    // The list: who made it, for whom, status; filtered to today.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())
    await page.goto(`/admin/quotations?from=${today}&to=${today}&test=1`)
    const row = page.getByTestId('quotation-row').filter({ hasText: name })
    await expect(row).toContainText('Shared')
    await expect(row).toContainText(toE164(phone))

    // The customer, on their own phone (no staff session): view and accept.
    const customer = await browser.newContext()
    await ownConnection(customer)
    const c = await customer.newPage()
    await c.goto(link)
    await expect(c.getByRole('heading', { name: 'Your quotation' })).toBeVisible()
    await expect(c.getByTestId('quotation').or(c.getByTestId('quotation-sample'))).toBeVisible()
    await c.getByTestId('accept-and-apply').click()
    // Staff's name and phone are only a starting point: the customer confirms their own.
    await expect(c.getByLabel('First name', { exact: true })).toHaveValue('Quote')
    await c.getByLabel('Email address', { exact: true }).fill(testEmail('staffq'))
    await c.getByLabel('Local government area', { exact: true }).fill('Ikeja')
    await c.getByRole('checkbox', { name: /may contact me about this system/ }).check()
    await c.getByTestId('accept-submit').click()
    await expect(c.getByTestId('accepted')).toContainText('Thank you!', { timeout: 45_000 })
    // Opening the link again: accepted, no second sign-up.
    await c.goto(link)
    await expect(c.getByTestId('quotation-accepted')).toBeVisible()
    await expect(c.getByTestId('accept-and-apply')).toHaveCount(0)
    await customer.close()

    await page.goto(adminUrl)
    await expect(page.getByTestId('quotation-status')).toContainText('Accepted')
    // The sign-up shows in the waiting list as entered by the staff member who made the quote.
    await page.goto(`/admin/waitlist?test=1`)
    await expect(page.getByText(name.split(' ')[1]!).first()).toBeVisible()
  })

  test('customer box: labelled fields in rows at phone, tablet and desktop widths (screenshots)', async ({
    page,
  }) => {
    test.skip(!hasStaff(), 'needs the e2e staff account')
    test.skip(test.info().project.name === 'mobile', 'widths are set by the test itself')
    await loginAsStaff(page)

    // Admin → Quotations: both buttons, each with its one-line explanation.
    await page.goto('/admin/quotations')
    await expect(page.getByTestId('new-quotation-note')).toHaveText(
      'Price quote only. No account or ID checks. Share as PDF or WhatsApp.',
    )
    await expect(page.getByTestId('new-application')).toHaveText(
      'New application on behalf of a customer',
    )
    await expect(page.getByTestId('new-application-note')).toHaveText(
      "Starts the customer's real application (their details and ID checks). Use when the customer is ready to apply now.",
    )

    for (const [label, width, height] of [
      ['phone', 375, 812],
      ['tablet', 768, 1024],
      ['desktop', 1700, 1000],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto('/admin/quotations/new')
      const box = page.getByTestId('quote-customer')
      await expect(box.getByText('Customer (optional)')).toBeVisible({ timeout: 30_000 })
      const boxRect = (await box.boundingBox())!
      const title = (await box.getByText('Customer (optional)').boundingBox())!
      const fields = await Promise.all(
        (['Name', 'Phone', 'State'] as const).map(async (name) => ({
          label: (await box.getByText(name, { exact: true }).boundingBox())!,
          input: (await box.getByLabel(name, { exact: true }).boundingBox())!,
        })),
      )
      const [n, ph, st] = fields as [(typeof fields)[0], (typeof fields)[0], (typeof fields)[0]]
      for (const f of fields) {
        // Below the title, inside the box, a real width (not a sliver at the edge).
        expect(f.label.y, label).toBeGreaterThan(title.y + title.height - 1)
        expect(f.input.x, label).toBeGreaterThanOrEqual(boxRect.x)
        expect(f.input.x + f.input.width, label).toBeLessThanOrEqual(boxRect.x + boxRect.width)
        expect(f.input.width, label).toBeGreaterThan(width < 640 ? 280 : 250)
        // Its own label sits above it.
        expect(f.label.y + f.label.height, label).toBeLessThanOrEqual(f.input.y + 1)
      }
      // Labels never print on top of each other.
      const overlap = (a: typeof n.label, b: typeof n.label) =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      expect(
        overlap(n.label, ph.label) || overlap(n.label, st.label) || overlap(ph.label, st.label),
        label,
      ).toBe(false)
      if (width < 640) {
        // Phones: one per line.
        expect(ph.input.y, label).toBeGreaterThan(n.input.y + n.input.height)
        expect(st.input.y, label).toBeGreaterThan(ph.input.y + ph.input.height)
      } else {
        // Tablet and desktop: Name and Phone side by side, State below.
        expect(Math.abs(ph.input.y - n.input.y), label).toBeLessThan(2)
        expect(ph.input.x, label).toBeGreaterThan(n.input.x + n.input.width)
        expect(st.input.y, label).toBeGreaterThan(n.input.y + n.input.height)
      }
      await test.info().attach(`customer-box-${label}-${width}px`, {
        body: await box.screenshot(),
        contentType: 'image/png',
      })
      await box.screenshot({ path: test.info().outputPath(`customer-box-${label}-${width}px.png`) })
    }
  })

  test('staff without the permission: no Quotations menu, pages closed', async ({ page }) => {
    test.skip(!process.env.E2E_OPS_EMAIL, 'needs the e2e ops account')
    test.skip(test.info().project.name === 'mobile', 'one browser is enough')
    await loginAsStaff(page, 'ops')
    await expect(page.getByRole('link', { name: 'Quotations' })).toHaveCount(0)
    await page.goto('/admin/quotations/new')
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('a wrong customer link says so', async ({ page }) => {
    await page.goto('/q/zzzzzzzzzzzz')
    await expect(page.getByTestId('quotation-missing')).toBeVisible()
  })
})

/** Sales (installers, marketers, migration 0033): Quotations only, no customer data. */
test.describe('sales role', () => {
  test.beforeEach(async ({ context }) => ownConnection(context))

  test('lands on Quotations; every other page and export is closed', async ({ page }) => {
    test.skip(!process.env.E2E_SALES_EMAIL, 'needs the e2e sales account (migration 0033)')
    test.skip(test.info().project.name === 'mobile', 'one browser is enough')
    await loginAsStaff(page, 'sales')
    const nav = page.getByRole('navigation', { name: 'Back office' })
    await expect(nav.getByRole('link')).toHaveText(['Quotations'])
    for (const path of [
      '/admin',
      '/admin/waitlist',
      '/admin/outbox',
      '/admin/applications',
      '/admin/pricing',
      '/admin/staff',
      '/admin/audit',
    ]) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/admin\/quotations$|\/$/, { timeout: 30_000 })
    }
    for (const api of ['/api/admin/waitlist/export.csv', '/api/admin/audit.csv']) {
      const res = await page.request.get(api, { maxRedirects: 0 })
      expect(res.status(), api).not.toBe(200)
    }
    // Their own quotations only: a fresh sales account has none from anyone else.
    await page.goto('/admin/quotations')
    await expect(page.getByText('Only your own quotations are shown.')).toBeVisible()
    // Sales sees only "New quotation" (never "New application on behalf of a customer").
    await expect(page.getByTestId('new-quotation')).toBeVisible()
    await expect(page.getByTestId('new-quotation-note')).toBeVisible()
    await expect(page.getByTestId('new-application')).toHaveCount(0)
    // What sales is for: make a quotation, then find it in their own list.
    const { adminUrl } = await createQuotationAsStaff(page, { name: '', phone: '' })
    const id = adminUrl.split('/').pop()!
    await page.goto('/admin/quotations?test=1')
    await expect(page.locator(`a[href="/admin/quotations/${id}"]`)).toBeVisible()
    await expect(page.getByTestId('quotation-row').first()).toContainText('E2E Sales')
  })
})
