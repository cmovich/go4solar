import { expect, type Page } from '@playwright/test'

/**
 * The SPEWA offer for businesses and institutions (migration 0039 + the loaded price list).
 * Read-only checks (service role): these tests never write prices or rules.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function get<T>(path: string): Promise<T | null> {
  if (!url || !key) return null
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok ? ((await res.json()) as T) : null
}

/**
 * True once migration 0039 is applied, SPEWA's price list is loaded (npm run spewa:load) and an
 * active default SPEWA offer rule for businesses exists.
 */
export async function offerReady(): Promise<boolean> {
  const [items, rules] = await Promise.all([
    get<{ code: string }[]>('spewa_price_items?select=code&active=eq.true&limit=1'),
    get<{ id: string }[]>(
      'funder_routing_rules?select=id&active=eq.true&is_default=eq.true&offer=eq.spewa&applicant_type=eq.business',
    ),
  ])
  return Boolean(items?.length && rules?.length)
}

/** The customer-facing minimum deposit note. */
export async function expectMinDepositNote(page: Page) {
  await expect(page.getByTestId('min-deposit-note')).toHaveText(
    'The minimum deposit for this offer is 30%',
  )
}

/** On the deposit slider: pressing left at 30% stays at 30% (with the note). */
export async function cannotGoBelow30(page: Page, pctTestId: string) {
  await expect(page.getByTestId(pctTestId)).toHaveText('30%', { timeout: 30_000 })
  await expectMinDepositNote(page)
  await page.getByRole('slider').first().focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId(pctTestId)).toHaveText('30%')
  await expectMinDepositNote(page)
}

/** The builder's first screen as a business or institution. */
export async function startBusinessBuilder(page: Page) {
  await page.goto('/build')
  await expect(page.getByTestId('build-who')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'For a business or institution' }).click()
  await page.getByLabel('Where will it be installed?').selectOption('Kaduna')
  await page.getByRole('button', { name: /^A complete system/ }).click()
}
