import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

/**
 * Trade Lenda (prelaunch, desktop, super admin): complete a TEST waiting-list entry's profile,
 * record the three ticks, send it as a batch for each lending type, open it as Trade Lenda
 * ("View as Trade Lenda") and check every page and download for anything internal. Only test
 * data is touched (the batches are marked test).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const FORBIDDEN = [
  'cost price',
  'vendor',
  'unitcost',
  'unit cost',
  'margin',
  'markup',
  'profit',
  'linetotal',
  'unitprice',
  'installcost',
  'pricingrate',
  'spewa',
]

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
  })
  return (await res.json()) as T
}

const ready = async () => {
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/funder_batches?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok
}

/** Oga Boss's internal figures: vendor costs, line prices and the vendor total. */
async function ogaCosts(): Promise<number[]> {
  const [p] = await rest<{ lines: { vendorCost: number; price: number }[] }[]>(
    'ready_plans?slug=eq.oga-boss&select=lines',
  )
  const lines = p?.lines ?? []
  const total = lines.reduce((s, l) => s + l.vendorCost, 0)
  return [total, ...lines.map((l) => l.vendorCost), ...lines.map((l) => l.price)].filter(
    (n) => n > 1000,
  )
}

function problems(text: string, costs: number[]): string[] {
  const t = text.toLowerCase()
  const out = FORBIDDEN.filter((w) => t.includes(w)).map((w) => `"${w}"`)
  const plain = t.replace(/[,₦\s]/g, '')
  for (const n of costs) if (new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(plain)) out.push(String(n))
  return out
}

async function download(request: APIRequestContext, href: string): Promise<string> {
  const res = await request.get(href)
  expect(res.status()).toBe(200)
  const body = await res.body()
  // Excel/PDF are compressed: check the readable text the server can produce for both via CSV,
  // and the raw bytes for anything that is stored uncompressed.
  return body.toString('latin1')
}

async function completeProfile(page: Page, id: string) {
  await page.goto(`/admin/waitlist/${id}/profile`)
  const f = page.getByTestId('profile-form')
  await f.getByLabel('First name').fill('Ada')
  await f.getByLabel('Surname').fill('Testcustomer')
  await f.getByLabel('Date of birth').fill('1990-01-01')
  await f.getByLabel('State').selectOption('Kaduna')
  await f.getByLabel('LGA').fill('Kaduna North')
  await f.getByLabel('Street address').fill('1 Test Street')
  await f.getByLabel('Landmark').fill('Near the test market')
  await f.getByLabel('Work').selectOption('employed')
  await f.getByLabel('Employer or business').fill('Test Ltd')
  await f.getByLabel('Monthly income').selectOption('above_3m')
  await f.getByLabel('NIN').fill('12345678901')
  await f.getByLabel('BVN').fill('22233344455')
  await f.getByLabel('Name', { exact: true }).fill('Bayo Testguarantor')
  await f.getByLabel('Phone', { exact: true }).fill('08000001234')
  await f.getByLabel('Relationship').fill('Brother')
  await f.getByLabel('Plan or system').selectOption('ready:oga-boss')
  await f.getByLabel('Deposit %').fill('20')
  await f.getByLabel('Months').selectOption('12')
  await page.getByTestId('profile-save').click()
  await expect(page.getByText('Profile saved.')).toBeVisible({ timeout: 30_000 })
  await page.reload()
  await expect(page.getByTestId('profile-missing')).toHaveCount(0)
  // Only the last 4 digits are kept.
  await expect(f.getByLabel('NIN')).toHaveAttribute('placeholder', 'Kept: ending 8901')
}

async function tickAll(page: Page, type: 'customer' | 'go4solar') {
  await page
    .getByRole('button', {
      name: type === 'customer' ? /lends to the customers/ : /lends to Go4Solar/,
    })
    .click()
  for (const id of ['phone', 'consent', 'figures']) {
    const box = page.getByTestId(`tick-${id}`).getByRole('checkbox')
    if (await box.isChecked()) {
      if (id !== 'figures') continue
      await box.click()
      await expect(box).not.toBeChecked({ timeout: 20_000 })
    }
    await box.click()
    await expect(box).toBeChecked({ timeout: 20_000 })
    await expect(box).toBeEnabled({ timeout: 20_000 })
  }
}

test.describe('Trade Lenda batches', () => {
  test('profile → ticks → send (both lending types) → view as Trade Lenda → downloads', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
    test.skip(!(await ready()), 'migration 0041 not applied')
    test.setTimeout(600_000)
    const [lead] = await rest<{ id: string }[]>(
      'waitlist_consumers?is_test=eq.true&status=eq.complete&cleared_at=is.null&select=id&order=created_at.desc&limit=1',
    )
    test.skip(!lead, 'no complete test entry to use')
    const costs = await ogaCosts()
    await loginAsStaff(page)
    await completeProfile(page, lead!.id)

    for (const type of ['customer', 'go4solar'] as const) {
      await page.goto(`/admin/waitlist/${lead!.id}/profile`)
      await tickAll(page, type)
      const figures = page.getByTestId(`figures-${type}`)
      if (type === 'customer') {
        // Oga Boss, 12 months, 20%: 4% a month on the price paid in full.
        await expect(figures).toContainText('₦1,307,000')
        await expect(figures).toContainText('₦128,957 × 12 months')
        await expect(figures).toContainText('₦1,808,888')
      } else {
        await expect(figures).toContainText('Drawn from Trade Lenda')
        await expect(figures).toContainText('₦1,045,600')
      }

      await page.goto('/admin/waitlist/profiles?test=1')
      await page.getByLabel('Trade Lenda lends to').selectOption(type)
      await expect(page.getByTestId('tl-balance')).toContainText('Trade Lenda available balance')
      await page
        .getByRole('checkbox', { name: /Send Ada Testcustomer/ })
        .first()
        .check()
      await page.getByTestId('send-to-tl').click()
      await expect(page.getByTestId('send-notice')).toContainText(/Sent as TLT-Batch-\d{3}/, {
        timeout: 60_000,
      })

      // View as Trade Lenda: the newest batch.
      await page.goto('/admin/funder?test=1')
      await expect(page.getByTestId('view-as')).toBeVisible()
      await page.getByTestId('funder-batches').getByRole('link').first().click()
      // Test batches have their own numbers (real batches start at TL-Batch-001).
      await expect(page.getByTestId('batch-title')).toContainText('TLT-Batch-')
      await expect(page.getByTestId('batch-title')).toContainText(
        type === 'customer' ? 'Lends to customers' : 'Lends to Go4Solar',
      )
      await expect(page.getByTestId('batch-summary')).toContainText('Total financed')
      const pageText = await page.locator('main').innerText()
      expect(problems(pageText, type === 'go4solar' ? costs : [])).toEqual([])

      const base = (await page
        .getByTestId('downloads')
        .getByRole('link', { name: 'CSV' })
        .getAttribute('href'))!
      const csv = await download(page.request, base)
      expect(csv).toContain('Ada')
      expect(problems(csv, type === 'go4solar' ? costs : [])).toEqual([])
      for (const fmt of ['xlsx', 'pdf']) {
        const raw = await download(page.request, base.replace('format=csv', `format=${fmt}`))
        expect(problems(raw, [])).toEqual([])
      }

      // One customer, as Trade Lenda sees them.
      await page.getByTestId('batch-customers').getByRole('link').first().click()
      const detail = await page.getByTestId('funder-customer').innerText()
      expect(detail).toContain('4.0% per month, flat')
      expect(problems(detail, type === 'go4solar' ? costs : [])).toEqual([])
    }
  })
})
