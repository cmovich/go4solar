import { expect, test, type Page } from '@playwright/test'

import { totp } from './helpers/totp'

const hasStaff = () => Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_TOTP_SECRET)

/** A random Nigerian mobile number per test so parallel runs never collide. */
function freshPhone(): string {
  const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
  return `080${tail}`
}

async function addLedAndFridge(page: Page) {
  await page.getByRole('button', { name: 'Lighting' }).click()
  await page.getByRole('button', { name: /^LED bulb/ }).click()
  await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
  await page.getByRole('button', { name: /^Fridge/ }).click()
  await expect(page.getByTestId('total-running')).toHaveText('160 W')
}

/** Screens 1–6: calculator → totals → preparing → phone → email → name/state. */
async function throughNameStep(page: Page, phone: string, state: string) {
  await page.goto('/waitlist')
  await addLedAndFridge(page)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your total load' })).toBeVisible()
  await page.getByRole('button', { name: 'Get quotes' }).click()
  await expect(page.getByText('Preparing your quotes…')).toBeVisible()
  await expect(page.getByLabel('Phone number')).toBeVisible({ timeout: 5000 })

  await page.getByLabel('Phone number').fill(phone)
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByLabel('Email address')).toBeVisible({ timeout: 5000 })
  await page.getByLabel('Email address').fill(`e2e-${phone}@go4solar.test`)
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByLabel('First name')).toBeVisible({ timeout: 5000 })
  await page.getByLabel('First name').fill('Amaka')
  await page.getByLabel('Surname').fill('Okoro')
  await page.getByLabel('State of installation').selectOption(state)
  await page.getByLabel('Local government area').fill('Ikeja')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Who is this solar for?' })).toBeVisible({
    timeout: 15000,
  })
}

/** Screens 9–11: plans → contribution → thank you (then the prelaunch redirect home). */
async function finishFromPlans(page: Page) {
  await expect(page.getByRole('heading', { name: 'Here are your plans, Amaka' })).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByText('Estimate', { exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: /Comfort/ }).click()

  await expect(page.getByRole('heading', { name: 'How much can you pay upfront?' })).toBeVisible()
  const totalAt20 = await page.getByTestId('total-price').textContent()
  await page.getByRole('slider').focus()
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('deposit-pct')).toHaveText('50%')
  await expect(page.getByTestId('saving')).toContainText('You save ₦')
  await expect(page.getByTestId('saving')).toContainText('by paying 50%')
  expect(await page.getByTestId('total-price').textContent()).not.toBe(totalAt20)
  await page.getByRole('button', { name: 'Now', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByText('Thank you, Amaka.')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('We will get back to you within the next 7 days.')).toBeVisible()
  await expect(page.getByText(/waiting list/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()
  // Prelaunch: back to the landing page after ~5 s.
  await page.waitForURL((u) => u.pathname === '/', { timeout: 10000 })
}

async function loginAsStaff(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_STAFF_EMAIL!)
  await page.getByLabel('Password').fill(process.env.E2E_STAFF_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/admin\/mfa/)
  await page.getByLabel('6-digit code').fill(totp(process.env.E2E_STAFF_TOTP_SECRET!))
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.waitForURL(/\/admin$/)
}

test.describe('solar plan sign-up (waiting list)', () => {
  // Eleven screens plus a staff login: give each test more than the default 30 s.
  test.describe.configure({ timeout: 120_000 })

  test('the state dropdown lists all 37 states with the launch states first', async ({ page }) => {
    const phone = freshPhone()
    await page.goto('/waitlist')
    await addLedAndFridge(page)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Get quotes' }).click()
    await expect(page.getByLabel('Phone number')).toBeVisible({ timeout: 5000 })
    await page.getByLabel('Phone number').fill(phone)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('Email address')).toBeVisible({ timeout: 5000 })
    await page.getByLabel('Email address').fill(`e2e-${phone}@go4solar.test`)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('State of installation')).toBeVisible({ timeout: 5000 })

    const options = page.getByLabel('State of installation').locator('option')
    await expect(options).toHaveCount(37)
    await expect(options.nth(0)).toHaveText('Abuja (FCT)')
    await expect(options.nth(1)).toHaveText('Kaduna')
    await expect(options.nth(2)).toHaveText('Lagos')
    await expect(options.nth(3)).toHaveText('Abia')
    await expect(options.last()).toHaveText('Zamfara')
  })

  test('individual pathway: home → plans → contribution → thank you → home', async ({ page }) => {
    await throughNameStep(page, freshPhone(), 'Lagos')
    await page.getByRole('button', { name: /My home/ }).click()
    await finishFromPlans(page)
  })

  test('business pathway in a non-launch state: business details → plans → thank you', async ({
    page,
  }) => {
    await throughNameStep(page, freshPhone(), 'Enugu')
    await page.getByRole('button', { name: /My business/ }).click()
    await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible()
    await page.getByLabel('Business name').fill('Amaka Stores')
    await page.getByLabel('Type of business').selectOption('shop')
    await page.getByLabel('Your role').fill('Owner')
    await page.getByLabel('Number of staff').fill('4')
    await page.getByLabel('Operating hours per day').fill('12')
    await page.getByLabel('Days per week').fill('6')
    await page.getByLabel('Generator fuel per month (₦)').fill('180000')
    await page.getByLabel('Electricity bills per month (₦)').fill('40000')
    await page.getByRole('button', { name: 'Next' }).click()
    await finishFromPlans(page)
  })

  test('leaving after the phone number leaves an incomplete lead that admin can see and export', async ({
    browser,
    page,
  }) => {
    test.skip(!hasStaff(), 'needs Supabase env (staff test user)')
    // Desktop only: the staff user's TOTP code cannot be used twice in one 30 s window.
    test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
    const phone = freshPhone()
    const e164 = `+234${phone.slice(1)}`

    await page.goto('/waitlist')
    await addLedAndFridge(page)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Get quotes' }).click()
    await expect(page.getByLabel('Phone number')).toBeVisible({ timeout: 5000 })
    await page.getByLabel('Phone number').fill(phone)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('Email address')).toBeVisible({ timeout: 5000 })
    // …and the visitor leaves here.

    const staff = await browser.newPage()
    await loginAsStaff(staff)
    await staff.goto('/admin/waitlist?tab=incomplete')
    await expect(staff.getByRole('heading', { name: 'Waiting list' })).toBeVisible()
    const row = staff.getByTestId('consumer-row').filter({ hasText: e164 })
    await expect(row).toBeVisible()
    await row.click()
    await expect(staff.getByRole('dialog').getByText(/Incomplete lead/)).toBeVisible()
    await expect(staff.getByText('LED bulb')).toBeVisible()
    // Close the drawer: while it is open the rest of the page is aria-hidden.
    await staff.keyboard.press('Escape')
    await expect(staff.getByRole('dialog')).toBeHidden()

    // The business filter and the state dropdown exist on the admin page.
    await expect(staff.getByLabel('Type')).toBeVisible()
    await expect(staff.getByLabel('State').locator('option')).toHaveCount(38) // All + 37

    // CSV export contains the row (fetched with the staff session's cookies).
    await expect(staff.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/admin/waitlist/export.csv',
    )
    const res = await staff.request.get('/api/admin/waitlist/export.csv', { timeout: 60_000 })
    expect(res.status(), await res.text().then((t) => t.slice(0, 300))).toBe(200)
    expect(res.headers()['content-type']).toContain('text/csv')
    const csv = await res.text()
    expect(csv).toContain('consumer,incomplete')
    expect(csv).toContain(e164)
    expect(csv).toContain('applicant_type,business_name')

    // PDF report renders (brand fonts and logo embedded) and has a summary page plus the list.
    const pdf = await staff.request.get('/api/admin/waitlist/report.pdf', { timeout: 90_000 })
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toContain('application/pdf')
    const bytes = await pdf.body()
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    const raw = bytes.toString('latin1')
    expect((raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(raw).toContain('Inter')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(test.info().outputPath('waitlist-report.pdf'), bytes)
    await staff.close()
  })

  test('installer form thanks the installer', async ({ page }) => {
    await page.goto('/partners/installer')
    await page.getByLabel('Your name').fill('Tunde Installs')
    await page.getByLabel('Phone', { exact: true }).fill(freshPhone())
    await page.getByLabel('Abuja (FCT)').check()
    await page.getByLabel('Years in business').fill('5')
    await page.getByLabel('Installations completed').fill('40')
    await page.getByLabel(/I agree that Go4Solar may contact me/).check()
    await page.getByRole('button', { name: 'Join as a partner installer' }).click()
    await expect(page.getByText('Thank you, Tunde Installs.')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('We will contact you within 7 days.')).toBeVisible()
  })
})
