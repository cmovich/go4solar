import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { expect, test, type Page } from '@playwright/test'

config({ path: '.env.local', quiet: true })
const hasDb = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

function freshPhone(): string {
  return `080${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
}

/** Reads the latest code the mock messaging provider "sent" (it lands in the outbox). */
async function latestOtpFor(e164: string): Promise<string> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  )
  for (let i = 0; i < 20; i++) {
    const { data } = await admin
      .from('outbox')
      .select('payload')
      .eq('template', 'otp_code')
      .eq('to', e164)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const text = (data?.payload as { text?: string } | null)?.text ?? ''
    const m = /\b(\d{6})\b/.exec(text)
    if (m?.[1]) return m[1]
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('no OTP in the outbox')
}

async function throughDetails(page: Page, phone: string, email: string) {
  await page.goto('/calculate')
  await page.getByRole('button', { name: 'Lighting' }).click()
  await page.getByRole('button', { name: /^LED bulb/ }).click()
  await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
  await page.getByRole('button', { name: /^Fridge/ }).click()
  // Live mode: the calculator leads into the details flow.
  await page.getByRole('link', { name: 'See my solar plans' }).click()
  await page.waitForURL(/\/get-started/)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Get quotes' }).click()
  await expect(page.getByLabel('Phone number')).toBeVisible({ timeout: 5000 })
  await page.getByLabel('Phone number').fill(phone)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Email address')).toBeVisible({ timeout: 5000 })
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('First name')).toBeVisible({ timeout: 5000 })
  await page.getByLabel('First name').fill('Chidi')
  await page.getByLabel('Surname').fill('Eze')
  await page.getByLabel('State of installation').selectOption('Lagos')
  await page.getByLabel('Local government area').fill('Ikeja')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /My home/ }).click({ timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'What do you pay for power today?' })).toBeVisible(
    { timeout: 20000 },
  )
  await page.getByRole('button', { name: 'Petrol generator' }).click()
  await page.getByLabel('How much do you spend on generator fuel in a typical week?').fill('12000')
  await page
    .getByLabel('How much do you spend on electricity (grid) bills in a typical week?')
    .fill('4200')
  await page.getByRole('button', { name: 'Next' }).click()
}

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
    await expect(page.getByLabel('6-digit code')).toBeVisible({ timeout: 20000 })
    await page.getByLabel('6-digit code').fill(await latestOtpFor(e164))
    await page.getByRole('button', { name: 'Verify my phone' }).click()

    await page.waitForURL(/\/app\/apply/, { timeout: 20000 })
    await expect(page.getByRole('heading', { name: 'Next: verify your identity' })).toBeVisible()
    await expect(page.getByTestId('chosen-quote')).toContainText('Comfort plan')
  })

  test('a wrong code is rejected', async ({ page }) => {
    const phone = freshPhone()
    await throughDetails(page, phone, `e2e-live-wrong-${phone}@go4solar.test`)
    await page.waitForURL(/\/plans\?estimate=/, { timeout: 20000 })
    await page.getByRole('button', { name: 'Choose Essential' }).click()
    await page.waitForURL(/\/account\?quote=/)
    await page.getByLabel('Create a password').fill('Solar-Plan-2026!')
    await page.getByRole('button', { name: 'Create account and send code' }).click()
    await expect(page.getByLabel('6-digit code')).toBeVisible({ timeout: 20000 })
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
