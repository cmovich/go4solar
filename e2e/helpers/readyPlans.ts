import { expect, type Page } from '@playwright/test'

import { testEmail, testPhone } from './test-identity'

/** True once migration 0034 (ready-made plans) is applied. */
export async function readyPlansMigrated(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/ready_plans?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok
}

/** True once migration 0035 (pay in full) is applied. */
export async function payInFullMigrated(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/loans?select=payment_type&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok
}

export const PLAN_ORDER = [
  'i-pass-my-neighbour',
  'level-up',
  'oga-boss',
  'no-wahala',
  'no-shaking',
  'relax',
  'relax-max',
]

/** Plan page → Choose this plan → roof questions → "Your quotation" → Accept and apply. */
export async function chooseAndAccept(
  page: Page,
  slug: string,
  opts: { payInFull?: boolean } = {},
): Promise<{ phone: string; email: string }> {
  await page.goto(`/plans/${slug}`)
  if (opts.payInFull) await page.getByTestId('choose-full').click()
  await page.getByTestId('choose-plan').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Where should the panels be mounted?',
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: /^Roof/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What type of roof do you have?')
  const cards = page.getByTestId('roof-card')
  if ((await cards.count()) > 0) await cards.first().click()
  else await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How tall is the building?')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your quotation')
  await expect(page.getByTestId('quotation').or(page.getByTestId('quotation-later'))).toBeVisible({
    timeout: 30_000,
  })
  if (opts.payInFull) {
    await expect(
      page.getByTestId('quotation-paid-in-full').or(page.getByTestId('quotation-later')),
    ).toBeVisible()
  }
  await page.getByTestId('accept-and-apply').click()
  const phone = testPhone()
  const email = testEmail('ready-plan')
  await page.getByLabel('First name', { exact: true }).fill('Plan')
  await page.getByLabel('Surname', { exact: true }).fill(`Test${Date.now() % 100000}`)
  await page.getByLabel('Phone number', { exact: true }).fill(phone)
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Local government area', { exact: true }).fill('Kaduna North')
  await page.getByRole('checkbox', { name: /may contact me about this system/ }).check()
  await page.getByTestId('accept-submit').click()
  return { phone, email }
}
