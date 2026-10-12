import { expect, test, type Page } from '@playwright/test'

import { TEST_FUNDER_NAME, testEmail } from '../helpers/test-identity'

import {
  PDF,
  PNG,
  applicationIdFor,
  freshNin,
  freshPhone,
  hasDb,
  jobIdFor,
  latestOutboxText,
  loginAsStaff,
  newPerson,
  oneMonthFromTodayLagos,
  throughAccount,
  throughDetails,
} from './helpers'

async function upload(page: Page, label: string, file: typeof PNG, kind: string) {
  await page.getByLabel(label).setInputFiles(file)
  await expect(page.getByTestId(`uploaded-${kind}`)).toBeVisible({ timeout: 20000 })
}

async function step(page: Page, id: string) {
  await expect(page.getByTestId(`step-${id}`)).toBeVisible({ timeout: 20000 })
}

/** NIN → BVN → consent → face → address (shared by both pathways). */
async function identityAndAddress(page: Page, nin: string) {
  await step(page, 'nin')
  await upload(page, 'Front of your NIN slip or card', PNG, 'nin_front')
  // A failing NIN first: the attempt is counted and the applicant can try again.
  await page.getByLabel('NIN (11 digits)').fill('00000000000')
  await page.getByRole('button', { name: 'Verify my NIN' }).click()
  await expect(page.getByText(/2 attempts left/)).toBeVisible({ timeout: 20000 })
  await page.getByLabel('NIN (11 digits)').fill(nin)
  await page.getByRole('button', { name: 'Verify my NIN' }).click()

  await step(page, 'bvn')
  await page.getByLabel('BVN (11 digits)').fill('22222222222')
  await page.getByRole('button', { name: 'Verify my BVN' }).click()

  await step(page, 'consent')
  await page.getByRole('checkbox', { name: 'Biometric consent' }).check()
  await page.getByRole('button', { name: 'I agree' }).click()

  await step(page, 'face')
  await page.getByRole('button', { name: 'Start the face check' }).click()
  await expect(page.getByTestId('face-prompt')).toBeVisible()

  await step(page, 'address')
  await upload(page, 'Proof of', PDF, 'address_proof')
  await page.getByLabel('Street address').fill('12 Allen Avenue')
  await page.getByLabel('Town or city').fill('Ikeja')
  await page.getByLabel('LGA').fill('Ikeja')
  await page.getByLabel('Latitude').fill('6.6018')
  await page.getByLabel('Longitude').fill('3.3515')
  await page.getByRole('button', { name: 'Save address' }).click()
}

type Guarantor = { phone: string; email: string }

function newGuarantor(): Guarantor {
  const phone = freshPhone()
  return { phone, email: testEmail('guarantor', phone) }
}

const e164 = (phone: string) => `+234${phone.slice(1)}`

/** Scroll the agreement to the end, tick every box, draw a signature, get the SMS code, sign. */
async function readTickDrawAndSign(page: Page, phone: string) {
  const send = page.getByRole('button', { name: 'Send my signing code' })
  await page.getByRole('checkbox').first().waitFor()
  for (const box of await page.getByRole('checkbox').all()) await box.check()
  const canvas = page.getByTestId('signature-canvas')
  await canvas.scrollIntoViewIfNeeded()
  const b = (await canvas.boundingBox())!
  await page.mouse.move(b.x + 30, b.y + b.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++)
    await page.mouse.move(b.x + 30 + i * 12, b.y + b.height / 2 + (i % 2 ? -15 : 15))
  await page.mouse.up()
  // Not read to the end yet: signing stays blocked.
  await expect(send).toBeDisabled()
  await expect(page.getByText('Read the agreement to the end to sign.')).toBeVisible()
  await page.getByTestId('agreement-scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await expect(send).toBeEnabled()
  await send.click()
  const sms = await latestOutboxText('signature_code', e164(phone))
  const code = /\b(\d{6})\b/.exec(sms)?.[1]
  expect(code).toBeTruthy()
  await page.getByLabel(/Enter the 6-digit code/).fill(code!)
  await page.getByRole('button', { name: 'Sign the agreement' }).click()
}

async function guarantorAndReview(page: Page, nin: string, g: Guarantor = newGuarantor()) {
  await step(page, 'guarantor')
  await page.getByLabel('Full name').fill('Ngozi Eze')
  await page.getByLabel('Phone').fill(g.phone)
  await page.getByLabel('Email').fill(g.email)
  await page.getByLabel('Relationship to you').fill('Sister')
  await page.getByRole('button', { name: 'Save' }).click()

  await step(page, 'review')
  await expect(page.getByText(`•••••••${nin.slice(-4)}`)).toBeVisible()
  await expect(page.getByText('•••••••2222')).toBeVisible()
  // The raw numbers are never shown.
  await expect(page.getByText(nin)).toHaveCount(0)
  await page.getByRole('button', { name: 'Confirm my application' }).click()
  await expect(page.getByTestId('next-sign')).toContainText('Next: sign your agreement', {
    timeout: 20000,
  })
}

test.describe('live mode: application wizard with mock KYC', () => {
  test.skip(!hasDb, 'needs Supabase env')

  test('individual: details → NIN → BVN → consent → face → address → income → next of kin → guarantor → review', async ({
    page,
  }) => {
    // The whole journey: apply, sign, guarantor, deposit, approval, installation, sign-off.
    test.setTimeout(600_000)
    const p = newPerson('individual')
    await throughDetails(page, p)
    await throughAccount(page, p)

    // Email: banner until the link is used.
    await expect(page.getByTestId('email-banner')).toBeVisible()
    const link = /(https?:\/\/\S+\/verify-email\?token=\S+)/.exec(
      await latestOutboxText('verify_email', p.email),
    )?.[1]
    expect(link).toBeTruthy()
    await page.goto(link!.replace(/^https?:\/\/[^/]+/, ''))
    await expect(page.getByText('Thank you — your email is confirmed.')).toBeVisible()
    await expect(page.getByTestId('email-banner')).toHaveCount(0)

    // Prefilled: name, phone and email are already there.
    await step(page, 'details')
    await expect(page.getByLabel('First name')).toHaveValue('Chidi')
    await expect(page.getByText(`+234${p.phone.slice(1)}`)).toBeVisible()
    await page.getByLabel('Date of birth').fill('1990-05-14')
    await page.getByRole('button', { name: 'These are correct' }).click()

    await identityAndAddress(page, p.nin)

    await step(page, 'income')
    await page.getByLabel('How do you earn your income?').selectOption('employed')
    await page.getByLabel('Your monthly income').selectOption('250k_500k')
    await page.getByRole('button', { name: 'Save' }).click()

    await step(page, 'nextOfKin')
    await page.getByLabel('Full name').fill('Emeka Eze')
    await page.getByLabel('Phone').fill(freshPhone())
    await page.getByLabel('Relationship to you').fill('Brother')
    await page.getByRole('button', { name: 'Save' }).click()

    const g = newGuarantor()
    await guarantorAndReview(page, p.nin, g)

    // ---- Terms: summary from the stored quote, full agreement, ticks, signature, phone code.
    await page.getByRole('link', { name: 'Read and sign' }).click()
    await page.waitForURL(/\/app\/apply\/sign/)
    await expect(page.getByTestId('sign-summary')).toContainText('Total amount payable')
    await expect(page.getByTestId('sign-summary')).toContainText('No interest')
    await expect(page.getByText('DRAFT — lawyer review required').first()).toBeVisible()
    await readTickDrawAndSign(page, p.phone)
    await expect(page.getByTestId('signed-done')).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('signed-done')).toContainText(
      /Document fingerprint: [0-9a-f]{64}/,
    )
    expect(await latestOutboxText('agreement_signed', p.email)).toMatch(/fingerprint/i)

    // ---- The deposit stays locked until the guarantor has signed.
    await page.getByTestId('next-deposit').click()
    await page.waitForURL(/\/app\/apply\/pay/)
    await expect(page.getByTestId('deposit-locked')).toContainText('Your guarantor needs to sign')
    await expect(page.getByTestId('pay-deposit')).toHaveCount(0)

    // ---- Guarantor opens the link from the outbox (no account).
    const invite = await latestOutboxText('guarantor_invite', g.email)
    const inviteLink = /(https?:\/\/\S+\/guarantee\/[A-Za-z0-9_-]+)/.exec(invite)?.[1]
    expect(inviteLink).toBeTruthy()
    const gp = await page.context().browser()!.newPage()
    await gp.goto(inviteLink!.replace(/^https?:\/\/[^/]+/, 'http://localhost:3100'))
    await expect(gp.getByTestId('guarantee-summary')).toContainText('Monthly payment')
    await gp.getByRole('button', { name: 'Yes, continue' }).click()

    // The applicant's own NIN is refused before any lookup.
    await gp.getByLabel('First name (as on your NIN)').fill('Ngozi')
    await gp.getByLabel('Surname').fill('Eze')
    await gp.getByLabel('Date of birth').fill('1988-03-02')
    await gp.getByLabel('NIN (11 digits)').fill(p.nin)
    await gp.getByRole('button', { name: 'Check my NIN' }).click()
    await expect(gp.getByText('The applicant cannot be their own guarantor.')).toBeVisible({
      timeout: 20000,
    })
    await gp.getByLabel('NIN (11 digits)').fill(freshNin())
    await gp.getByRole('button', { name: 'Check my NIN' }).click()

    await gp.getByRole('checkbox').check({ timeout: 20000 })
    await gp.getByRole('button', { name: 'Continue' }).click()
    await gp.getByRole('button', { name: 'Start the face check' }).click({ timeout: 20000 })
    await gp.getByLabel('Home address').fill('4 Admiralty Way, Lekki', { timeout: 30000 })
    await gp.getByLabel('State').selectOption('Lagos')
    await gp.getByLabel('Work').selectOption('employed')
    await gp.getByLabel('Monthly income').selectOption('250k_500k')
    await gp.getByRole('button', { name: 'Continue to the guarantee' }).click()

    await expect(gp.getByRole('heading', { name: 'Read and sign the guarantee' })).toBeVisible({
      timeout: 20000,
    })
    await readTickDrawAndSign(gp, g.phone)
    await expect(gp.getByTestId('guarantee-signed')).toBeVisible({ timeout: 60000 })

    // The same link cannot be used again.
    await gp.reload()
    await expect(gp.getByTestId('guarantee-problem')).toContainText('You have already signed')
    await gp.close()

    // ---- Now the deposit unlocks: pay it on the (mock) checkout, then set up auto-pay.
    await page.reload()
    await expect(page.getByTestId('deposit-locked')).toHaveCount(0)
    await expect(page.getByTestId('deposit-summary')).toContainText('Total amount payable')
    await page.getByTestId('pay-deposit').click()
    await expect(page.getByTestId('mock-provider')).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: /^Pay ₦/ }).click()
    await expect(page.getByTestId('autopay-step')).toContainText('Deposit received', {
      timeout: 30000,
    })
    expect(await latestOutboxText('deposit_received', p.email)).toMatch(/under review/i)

    await page.getByTestId('setup-autopay').click()
    await expect(
      page.getByRole('heading', { name: 'Approve auto-pay (direct debit)' }),
    ).toBeVisible({
      timeout: 30000,
    })
    await page.getByRole('button', { name: 'Approve auto-pay' }).click()

    // ---- Dashboard: under review, schedule, auto-pay on, signed agreement.
    await page.waitForURL(/\/app\?autopay=/, { timeout: 30000 })
    await expect(page.getByTestId('application-status')).toHaveText('Under review')
    await expect(page.getByTestId('timeline')).toContainText('Deposit paid')
    await expect(page.getByTestId('autopay-status')).toContainText('Auto-pay is on')
    await expect(page.getByTestId('schedule').locator('tbody tr')).not.toHaveCount(0)
    await expect(page.getByTestId('documents')).toContainText('signed payment plan agreement')
    await expect(page.getByTestId('still-missing')).toHaveCount(0)
    // The wizard now sends the customer to the dashboard.
    await page.goto('/app/apply')
    await page.waitForURL(/\/app$/)
    await expect(page.getByTestId('payments-start')).toContainText(
      'Payments start one month after installation',
    )

    // ---- Staff: approve with a funder, assign the installer, record the installation.
    const appId = await applicationIdFor(p.email)
    const staffContext = await page.context().browser()!.newContext()
    const staff = await staffContext.newPage()
    await loginAsStaff(staff)
    await staff.goto(`/admin/applications/${appId}`)
    await expect(staff.getByTestId('approval-blockers')).toHaveCount(0)
    // Test customers only ever see (and draw on) the test funder: never SAMPLE or real funders.
    await expect(staff.getByTestId('funder-options')).toContainText(TEST_FUNDER_NAME)
    await expect(staff.getByTestId('funder-options')).not.toContainText('SPEWA')
    await staff.getByRole('radio', { name: TEST_FUNDER_NAME }).check()
    await staff.getByRole('button', { name: `Approve with ${TEST_FUNDER_NAME}` }).click()
    await expect(staff.getByTestId('admin-status')).toHaveText('approved', { timeout: 30000 })
    expect(await latestOutboxText('application_approved', p.email)).toMatch(/approved/i)

    await staff.goto('/admin/jobs')
    const card = staff.getByTestId('awaiting-job').filter({ hasText: `+234${p.phone.slice(1)}` })
    await card.getByLabel('Installer', { exact: true }).fill('Bayo Installs')
    await card.getByLabel('Installer phone').fill(freshPhone())
    await card.getByLabel('Installation date').fill('2026-12-20')
    await card.getByRole('button', { name: 'Assign' }).click()
    await expect(card).toHaveCount(0, { timeout: 30000 })
    expect(await latestOutboxText('installer_assigned', p.email)).toMatch(/Bayo Installs/)

    await staff.goto(`/admin/jobs/${await jobIdFor(appId)}`)
    const code = (await staff.getByTestId('pickup-code').textContent())!.trim()
    await staff.getByLabel(/Pickup code/).fill(code)
    await staff.getByRole('button', { name: 'Release' }).click()
    await expect(staff.getByTestId('job-status')).toHaveText('picked up', { timeout: 30000 })
    await staff.getByLabel('Panels').fill('PNL-E2E-0001\nPNL-E2E-0002')
    await staff.getByLabel('Batteries').fill('BAT-E2E-0001')
    await staff.getByLabel('Inverters').fill('INV-E2E-0001')
    await staff.getByRole('button', { name: 'Save serial numbers' }).click()
    await expect(staff.getByText('Serial numbers saved.')).toBeVisible({ timeout: 30000 })
    await staff.getByLabel('Commissioning photo').setInputFiles({ ...PNG, name: 'installed.png' })
    await staff.getByRole('button', { name: 'Upload' }).click()
    await expect(staff.getByText('Photo added.')).toBeVisible({ timeout: 30000 })
    await staff.getByRole('button', { name: 'Mark installed' }).click()
    await expect(staff.getByTestId('job-status')).toHaveText('installed', { timeout: 30000 })

    // ---- Customer confirms: the plan starts, first payment one month from today.
    await page.reload()
    await expect(page.getByTestId('installation')).toContainText('Bayo Installs')
    await page.getByTestId('confirm-installation').click()
    await page.waitForURL(/installed=1/, { timeout: 30000 })
    await expect(page.getByTestId('application-status')).toHaveText('Your payment plan is active')
    await expect(page.getByTestId('payments-start')).toHaveText(
      `Next payment due ${oneMonthFromTodayLagos()}.`,
    )
    await expect(page.getByTestId('timeline').getByText('Installed')).toBeVisible()
    await expect(page.getByTestId('pay-now')).toBeVisible()

    // ---- Profit dashboard: test customers are hidden unless "Show test data" is on.
    await staff.goto('/admin/profit')
    await expect(staff.getByTestId('profit-cards')).toContainText('GRAND TOTAL')
    await expect(staff.getByTestId('profit-customers')).not.toContainText(TEST_FUNDER_NAME)
    await staff.getByTestId('test-data-toggle').click()
    await staff.waitForURL(/test=1/)
    await expect(staff.getByTestId('profit-customers')).toContainText(TEST_FUNDER_NAME)
    await expect(staff.getByTestId('profit-funders')).toContainText(TEST_FUNDER_NAME)
    await expect(staff.getByTestId('profit-charts')).toBeVisible()

    // ---- Forecasts: Low / Base / High, from the waiting list, save, export PDF and Excel.
    await staff.goto('/admin/forecasts?test=1')
    await expect(staff.getByTestId('break-even-base')).toContainText(/Month|Not within/)
    await staff.getByTestId('from-waitlist').click()
    await expect(staff.getByTestId('waitlist-summary')).toContainText('sign-ups', { timeout: 30000 })
    await staff.getByLabel('Scenario name').fill(`E2E TEST scenario ${p.phone}`)
    await staff.getByRole('button', { name: 'Save scenario' }).click()
    await staff.waitForURL(/forecasts\?id=/, { timeout: 30000 })
    const scenarioId = new URL(staff.url()).searchParams.get('id')!
    const pdf = await staff.request.get(`/api/admin/forecasts/${scenarioId}/pdf`, { timeout: 90_000 })
    expect(pdf.status()).toBe(200)
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
    const xlsx = await staff.request.get(`/api/admin/forecasts/${scenarioId}/xlsx`, { timeout: 60_000 })
    expect(xlsx.status()).toBe(200)
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK')
    // The customer cannot reach any of it.
    expect((await page.request.get(`/api/admin/forecasts/${scenarioId}/pdf`)).status()).toBe(403)
    await staffContext.close()
  })

  test('business: CAC (needs certificate + director tick) → owner KYC → business statements → guarantor → review', async ({
    page,
  }) => {
    const p = newPerson('business')
    await throughDetails(page, p)
    await throughAccount(page, p)

    await step(page, 'details')
    await expect(page.getByLabel('Business name')).toHaveValue('Eze Stores')
    await page.getByLabel('Date of birth').fill('1985-01-20')
    await page.getByRole('button', { name: 'These are correct' }).click()

    await step(page, 'business')
    // Requirements are enforced: certificate first, then the director tick.
    await page.getByLabel('CAC number').fill('RC123456')
    await page.getByRole('button', { name: 'Verify my business' }).click()
    await expect(page.getByText(/Tick to confirm you are a director/)).toBeVisible()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Verify my business' }).click()
    await expect(page.getByText('Upload your CAC certificate first.')).toBeVisible()
    await upload(page, 'CAC certificate', PDF, 'cac_certificate')
    await page.getByRole('button', { name: 'Verify my business' }).click()

    await identityAndAddress(page, p.nin)

    await step(page, 'income')
    await page.getByLabel('Typical monthly income of the business').selectOption('1m_3m')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(
      page.getByText('Upload 6 months of business bank statements (PDF) first.'),
    ).toBeVisible()
    await upload(page, 'Business bank statements (last 6 months, PDF)', PDF, 'business_statement')
    await page.getByRole('button', { name: 'Save' }).click()

    await guarantorAndReview(page, p.nin)
    await expect(page.getByText(/CAC RC123456/)).toBeVisible()
  })
})
