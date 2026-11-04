import { expect, test } from '@playwright/test'

import {
  acceptQuotation,
  checkVerifyPage,
  invoiceForQuote,
  openPdf,
  quotationAcceptMigrated,
} from '../helpers/invoices'
import { testEmail } from '../helpers/test-identity'

import { freshNin, freshPhone, hasDb, latestOtpFor, throughDetails as details } from './helpers'

const throughDetails = (page: Parameters<typeof details>[0], phone: string, email: string) =>
  details(page, {
    phone,
    email,
    nin: freshNin(),
    type: 'individual',
    firstName: 'Chidi',
    surname: 'Eze',
  })

test.describe('live mode: plans → account → phone code → application', () => {
  test.skip(!hasDb, 'needs Supabase env')

  test('calculator → details → plans → choose → account → OTP → /app/apply', async ({ page }) => {
    const phone = freshPhone()
    const e164 = `+234${phone.slice(1)}`
    const email = testEmail('live', phone)

    await throughDetails(page, phone, email)

    // /plans: nothing is asked again; three priced plans with the extras.
    await page.waitForURL(/\/plans\?estimate=/, { timeout: 20000 })
    await expect(page.getByRole('heading', { name: 'Here are your plans, Chidi' })).toBeVisible()
    await expect(page.getByLabel('Phone number')).toHaveCount(0)
    await expect(page.getByLabel('Email address')).toHaveCount(0)
    await expect(page.getByText(/Valid until/)).toBeVisible()
    await expect(
      page.getByText(/Backup hours assume every item on your list is switched on/),
    ).toBeVisible()
    // Part B backup lines on the plan card.
    await expect(page.getByTestId('backup-comfort')).toContainText('Backup with everything on ≈')
    await expect(page.getByTestId('backup-comfort')).toContainText(
      'In the rainy season, expect less backup on cloudy days.',
    )
    await expect(page.getByTestId('plan-advice')).toHaveCount(3)
    await expect(page.getByTestId('plan-advice').first()).toContainText('₦70,200')

    // Part I: "Download PDF" under a plan → the QUOTATION (quote reference, no invoice number).
    const planPdf = await page.getByTestId('invoice-comfort').getAttribute('href')
    expect(planPdf).toContain('tenure=12')
    await openPdf(page.request, planPdf!, 'quotation')

    // Tenure chips and deposit change the price.
    const total12 = await page.getByTestId('total-comfort').textContent()
    await page.getByRole('button', { name: '6 months' }).click()
    await expect(page.getByTestId('total-comfort')).not.toHaveText(total12 ?? '')
    await page.getByRole('button', { name: '12 months' }).click()

    await page.getByRole('button', { name: 'Choose Comfort' }).click()

    // Part I: "Your quotation" before any identity step: the full quotation, its PDF, Accept.
    await page.waitForURL(/\/quotation\/[0-9a-f-]{36}$/, { timeout: 45_000 })
    const quoteId = new URL(page.url()).pathname.split('/').pop()!
    await expect(page.getByTestId('quotation')).toContainText('Comfort plan', { timeout: 30_000 })
    await expect(page.getByTestId('quotation-lines')).toContainText('Installation')
    await expect(page.getByTestId('quotation-total')).toContainText('₦')
    await expect(page.getByTestId('quotation-notes')).toContainText('Prices valid until')
    const quotationPdf = await openPdf(
      page.request,
      (await page.getByTestId('quotation-pdf').getAttribute('href'))!,
      'quotation',
    )
    expect(quotationPdf.number).toMatch(/^G4S-[0-9A-F]{8}$/)
    if (await quotationAcceptMigrated()) {
      // The account step is closed until the quotation is accepted; no invoice number yet.
      await page.goto(`/account?quote=${quoteId}`)
      await page.waitForURL(/\/quotation\//)
      expect(await invoiceForQuote(quoteId)).toBeNull()
    }
    await page.getByTestId('accept-quotation').click()

    // Account step: email prefilled, phone shown (not asked).
    await page.waitForURL(/\/account\?quote=/)
    await expect(page.getByLabel('Email')).toHaveValue(email)
    await expect(page.getByTestId('phone-on-file')).toContainText(phone.slice(0, 4))
    await expect(page.getByLabel('Phone number')).toHaveCount(0)
    await page.getByLabel('Create a password').fill('Solar-Plan-2026!')
    await page.getByRole('button', { name: 'Create account and send code' }).click()

    // Code from the outbox (mock messaging).
    await expect(page.getByLabel('6-digit code')).toBeVisible({ timeout: 45000 })
    await page.getByLabel('6-digit code').fill(await latestOtpFor(e164))
    await page.getByRole('button', { name: 'Verify my phone' }).click()

    await page.waitForURL(/\/app\/apply/, { timeout: 20000 })
    // The application wizard opens at "Confirm your details" for the chosen Comfort quote.
    await expect(page.getByRole('heading', { name: 'Confirm your details' })).toBeVisible()
    await expect(page.getByText(/Comfort · G4S-/)).toBeVisible()

    // Accept made the numbered invoice: its verify page says genuine (first name only).
    const invoice = await invoiceForQuote(quoteId)
    expect(invoice?.number).toMatch(/^G4S-TEST-INV-\d{4}-\d{4,}$/)
    const tab = await page.context().newPage()
    await checkVerifyPage(tab, invoice!.code, 'Chidi')
    await tab.close()
    // My account "Invoice (PDF)": the same invoice, opened in the browser (signed link)…
    const first = await page.request.get(`/api/app/invoices/${quoteId}`, { maxRedirects: 0 })
    expect(first.status()).toBe(303)
    const signed = first.headers()['location']!
    expect((await openPdf(page.request, signed, 'invoice')).number).toBe(invoice!.number)
    // …which also opens with no sign-in cookie at all (download managers).
    const bare = await fetch(signed)
    expect(bare.headers.get('content-type')).toBe('application/pdf')
  })

  test('a wrong code is rejected', async ({ page }) => {
    const phone = freshPhone()
    await throughDetails(page, phone, testEmail('live-wrong', phone))
    await page.waitForURL(/\/plans\?estimate=/, { timeout: 20000 })
    await page.getByRole('button', { name: 'Choose Essential' }).click()
    await acceptQuotation(page)
    await page.getByLabel('Create a password').fill('Solar-Plan-2026!')
    await page.getByRole('button', { name: 'Create account and send code' }).click()
    await expect(page.getByLabel('6-digit code')).toBeVisible({ timeout: 45000 })
    const real = await latestOtpFor(`+234${phone.slice(1)}`)
    await page.getByLabel('6-digit code').fill(real === '000000' ? '111111' : '000000')
    await page.getByRole('button', { name: 'Verify my phone' }).click()
    await expect(page.getByText('That code is not right')).toBeVisible()
  })

  test('/plans without a valid estimate goes back to the start', async ({ page }) => {
    await page.goto('/plans?estimate=00000000-0000-4000-8000-000000000000')
    await page.waitForURL(/\/get-started/)
  })
})
