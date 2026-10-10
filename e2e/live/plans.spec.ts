import { expect, test } from '@playwright/test'

import { hasDb, latestOtpFor, throughDetails as details } from './helpers'

const freshPhone = () => `080${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
const throughDetails = (page: Parameters<typeof details>[0], phone: string, email: string) =>
  details(page, { phone, email, type: 'individual' })

test.describe('live mode: plans → account → phone code → application', () => {
  test.skip(!hasDb, 'needs Supabase env')

  test('calculator → details → plans → choose → account → OTP → /app/apply', async ({ page }) => {
    const phone = freshPhone()
    const e164 = `+234${phone.slice(1)}`
    const email = `e2e-live-${phone}@go4solar.test`

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
    await expect(page.getByTestId('realistic-comfort')).toContainText(
      'Your realistic backup: about',
    )
    await expect(page.getByTestId('plan-advice')).toHaveCount(3)
    await expect(page.getByTestId('plan-advice').first()).toContainText('₦70,200')

    // Tenure chips and deposit change the price.
    const total12 = await page.getByTestId('total-comfort').textContent()
    await page.getByRole('button', { name: '6 months' }).click()
    await expect(page.getByTestId('total-comfort')).not.toHaveText(total12 ?? '')
    await page.getByRole('button', { name: '12 months' }).click()

    await page.getByRole('button', { name: 'Choose Comfort' }).click()

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
  })

  test('a wrong code is rejected', async ({ page }) => {
    const phone = freshPhone()
    await throughDetails(page, phone, `e2e-live-wrong-${phone}@go4solar.test`)
    await page.waitForURL(/\/plans\?estimate=/, { timeout: 20000 })
    await page.getByRole('button', { name: 'Choose Essential' }).click()
    await page.waitForURL(/\/account\?quote=/)
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
