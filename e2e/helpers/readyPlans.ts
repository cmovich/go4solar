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
]

/** Added 14 Nov switched off: shown after Relax only once a super admin switches it on. */
export const RELAX_MAX = 'relax-max'

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

/** Ticked "Show on home page" (migration 0037); with none ticked the first three show anyway. */
export const HOME_SHOWN = ['i-pass-my-neighbour', 'level-up', 'oga-boss']

/**
 * Home page "See more plans": the ticked plans show at once; "See more plans (N)" (the last card
 * on phones, the button under the list on any screen) reveals the other switched-on plans with no
 * reload; "Show fewer" hides them and leaves the button where it was on screen. Ends collapsed.
 */
export async function checkSeeMore(page: Page, mobile: boolean) {
  const section = page.getByTestId('ready-plans')
  const cards = section.locator('article[data-testid^="ready-plan-"]')
  const slugs = (onlyVisible: boolean) =>
    cards.evaluateAll(
      (els, v) =>
        els
          .filter((e) => !v || e.checkVisibility())
          .map((e) => e.getAttribute('data-testid')!.replace('ready-plan-', '')),
      onlyVisible,
    )
  const all = await slugs(false)
  const moreCount = all.length - HOME_SHOWN.length
  expect(moreCount).toBeGreaterThan(0)
  expect(await slugs(true)).toEqual(HOME_SHOWN)
  const button = section.getByTestId('see-more-plans')
  const card = section.getByTestId('see-more-card')
  await expect(button).toHaveText(`See more plans (${moreCount})`)
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  const url = page.url()
  if (mobile) {
    await expect(card).toBeVisible()
    await expect(card).toContainText(`See more plans (${moreCount})`)
    await card.click()
  } else {
    await expect(card).toBeHidden()
    await button.click()
  }
  await expect.poll(() => slugs(true)).toEqual(all)
  await expect(button).toHaveText('Show fewer')
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(card).toHaveCount(0)
  expect(page.url()).toBe(url)
  // Show fewer: the hidden plans go, and the button stays put on screen (no jump).
  await button.scrollIntoViewIfNeeded()
  const before = (await button.boundingBox())!.y
  await button.click()
  await expect.poll(() => slugs(true)).toEqual(HOME_SHOWN)
  await expect(button).toHaveText(`See more plans (${moreCount})`)
  expect(Math.abs((await button.boundingBox())!.y - before)).toBeLessThan(3)
  if (mobile) await expect(card).toBeVisible()
  expect(page.url()).toBe(url)
}
