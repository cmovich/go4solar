import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { expect, type Page } from '@playwright/test'

import { testEmail, testNin, testPhone, toE164 } from '../helpers/test-identity'
import { totp } from '../helpers/totp'

config({ path: '.env.local', quiet: true })
export const hasDb = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
)

/** Test identities only (see ../helpers/test-identity.ts). */
export const freshPhone = testPhone
export { toE164 }

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  )
}

/** Latest outbox payload text for a template + recipient (mock messaging lands there). */
export async function latestOutboxText(template: string, to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const { data } = await admin()
      .from('outbox')
      .select('payload')
      .eq('template', template)
      .eq('to', to)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const text = (data?.payload as { text?: string } | null)?.text
    if (text) return text
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`no ${template} message for ${to} in the outbox`)
}

export async function latestOtpFor(e164: string): Promise<string> {
  const m = /\b(\d{6})\b/.exec(await latestOutboxText('otp_code', e164))
  if (!m?.[1]) throw new Error('no code in the OTP message')
  return m[1]
}

/** A NIN the mock KYC accepts (11 digits starting with 1), new for every run: one active application per NIN. */
export const freshNin = testNin

export type Person = {
  phone: string
  email: string
  nin: string
  type: 'individual' | 'business'
  firstName: string
  surname: string
}

export function newPerson(
  type: Person['type'] = 'individual',
  name: { firstName: string; surname: string } = { firstName: 'Chidi', surname: 'Eze' },
): Person {
  const phone = freshPhone()
  return { phone, email: testEmail(`live-${type}`, phone), nin: freshNin(), type, ...name }
}

/** Calculator → details flow → energy → lands on /plans. */
export async function throughDetails(page: Page, p: Person) {
  await page.goto('/calculate')
  await page.getByRole('button', { name: 'Lighting' }).click()
  await page.getByRole('button', { name: /^LED bulb/ }).click()
  await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
  await page.getByRole('button', { name: /^Fridge/ }).click()
  await page.getByRole('link', { name: 'See my solar plans' }).click()
  await page.waitForURL(/\/get-started/)
  // Fix-up 1 #1: the appliances carry over; the calculator is not shown a second time.
  await expect(page.getByRole('heading', { name: 'Your total load' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Calculate your load' })).toHaveCount(0)
  await expect(page.getByText('2 appliances on your list.')).toBeVisible()
  await page.getByRole('button', { name: 'Get quotes' }).click()
  await expect(page.getByLabel('Phone number')).toBeVisible({ timeout: 5000 })
  await page.getByLabel('Phone number').fill(p.phone)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Email address')).toBeVisible({ timeout: 5000 })
  // Back keeps the answer, and saving again updates the same lead (no second lead).
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByLabel('Phone number')).toHaveValue(p.phone)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Email address')).toBeVisible({ timeout: 15000 })
  await page.getByLabel('Email address').fill(p.email)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('First name')).toBeVisible({ timeout: 5000 })
  await page.getByLabel('First name').fill(p.firstName)
  await page.getByLabel('Surname').fill(p.surname)
  await page.getByLabel('State of installation').selectOption('Lagos')
  await page.getByLabel('Local government area').fill('Ikeja')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Next' }).click()
  if (p.type === 'business') {
    await page.getByRole('button', { name: /My business/ }).click({ timeout: 45000 })
    await page.getByLabel('Business name').fill('Eze Stores')
    await page.getByLabel('Type of business').selectOption('shop')
    await page.getByLabel('Your role').fill('Owner')
    await page.getByLabel('Number of staff').fill('4')
    await page.getByLabel('Operating hours per day').fill('12')
    await page.getByLabel('Days per week').fill('6')
    await page.getByRole('button', { name: 'Next' }).click()
  } else {
    await page.getByRole('button', { name: /My home/ }).click({ timeout: 45000 })
  }
  await expect(page.getByRole('heading', { name: 'What do you pay for power today?' })).toBeVisible(
    { timeout: 20000 },
  )
  await page.getByRole('button', { name: 'Petrol generator' }).click()
  await page.getByLabel('How much do you spend on generator fuel in a typical week?').fill('12000')
  await page
    .getByLabel('How much do you spend on electricity (grid) bills in a typical week?')
    .fill('4200')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.waitForURL(/\/plans\?estimate=/, { timeout: 20000 })
}

/** /plans → choose Comfort → account → phone code → /app/apply. */
export async function throughAccount(page: Page, p: Person) {
  await page.getByRole('button', { name: 'Choose Comfort' }).click()
  await page.waitForURL(/\/account\?quote=/)
  await page.getByLabel('Create a password').fill('Solar-Plan-2026!')
  await page.getByRole('button', { name: 'Create account and send code' }).click()
  await expect(page.getByLabel('6-digit code')).toBeVisible({ timeout: 45000 })
  await page.getByLabel('6-digit code').fill(await latestOtpFor(`+234${p.phone.slice(1)}`))
  await page.getByRole('button', { name: 'Verify my phone' }).click()
  await page.waitForURL(/\/app\/apply/, { timeout: 45000 })
}

// Tiny valid files for uploads.
export const PNG = {
  name: 'slip.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
}
export const PDF = {
  name: 'doc.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'),
}

/** The staff user from global-setup (super admin with an authenticator). */
export async function loginAsStaff(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_STAFF_EMAIL!)
  await page.getByLabel('Password').fill(process.env.E2E_STAFF_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/admin\/mfa/)
  await page.getByLabel('6-digit code').fill(totp(process.env.E2E_STAFF_TOTP_SECRET!))
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.waitForURL(/\/admin$/)
}

/** The newest application of the customer with this email. */
export async function applicationIdFor(email: string): Promise<string> {
  const { data } = await admin()
    .from('applications')
    .select('id, personal')
    .order('created_at', { ascending: false })
    .limit(50)
  const row = (data ?? []).find((a) => (a.personal as { email?: string } | null)?.email === email)
  if (!row) throw new Error(`no application for ${email}`)
  return row.id as string
}

export async function jobIdFor(applicationId: string): Promise<string> {
  const { data: loan } = await admin()
    .from('loans')
    .select('id')
    .eq('application_id', applicationId)
    .single()
  const { data: job } = await admin().from('jobs').select('id').eq('loan_id', loan!.id).single()
  return job!.id as string
}

/** Expected first due date after a sign-off today: one month on, Lagos date, month-end safe. */
export function oneMonthFromTodayLagos(): string {
  const local = new Date(Date.now() + 60 * 60 * 1000)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth() + 1
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const due = new Date(Date.UTC(y, m, Math.min(local.getUTCDate(), last), 12))
  return due.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
