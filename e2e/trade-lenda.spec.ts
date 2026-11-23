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
  'nin (',
  'nin:',
  'bvn',
  '(last 4)',
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

/** A fresh TEST waiting-list person (a +234800000 phone marks it test). */
async function newTestLead(): Promise<{ id: string; phone: string }> {
  const phone = `+234800000${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`
  const res = await fetch(`${url}/rest/v1/waitlist_consumers`, {
    method: 'POST',
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      phone_e164: phone,
      visitor_token_hash: `e2e-tl-${Date.now()}`,
      status: 'complete',
      applicant_type: 'individual',
      state: 'Kaduna',
      lga: 'Kaduna North',
      consent: true,
      consent_at: new Date().toISOString(),
      load_items: [],
      load_totals: {},
    }),
  })
  expect(res.ok).toBe(true)
  const [row] = (await res.json()) as { id: string; is_test: boolean }[]
  expect(row!.is_test).toBe(true)
  return { id: row!.id, phone }
}

async function completeProfile(page: Page, id: string) {
  await page.goto(`/admin/waitlist/${id}/edit`)
  const f = page.getByTestId('profile-form')
  await f.getByLabel('Customer type').selectOption('individual')
  await f.getByLabel('First name').fill('Ada')
  await f.getByLabel('Surname').fill('Testcustomer')
  await f.getByLabel('Email').fill('e2e-tl-ada@go4solar.test')
  await f.getByLabel('WhatsApp number').fill('08000004321')
  await f.getByLabel('State').selectOption('Kaduna')
  await f.getByLabel('LGA').fill('Kaduna North')
  await f.getByLabel('Street address').fill('1 Test Street')
  await f.getByLabel('Landmark').fill('Near the test market')
  // Optional details (work, income, guarantor, date of birth) are left empty: they never block.
  await f.getByLabel('Plan or system').selectOption('ready:oga-boss')
  await f.getByLabel('Deposit %').fill('20')
  await f.getByLabel('Months').selectOption('12')
  await page.getByTestId('profile-save').click()
  await expect(page.getByText('Profile saved.')).toBeVisible({ timeout: 30_000 })
  await page.reload()
  await expect(page.getByTestId('profile-missing')).toHaveCount(0)
  // We never collect NIN/BVN for Trade Lenda.
  await expect(f.getByLabel('NIN')).toHaveCount(0)
  await expect(page.getByTestId('tick-phone')).toContainText('Details confirmed by phone')
}

async function tickAll(page: Page, type: 'customer' | 'go4solar') {
  await page
    .getByRole('button', {
      name: type === 'customer' ? /lends to the customers/ : /lends to Go4Solar/,
    })
    .click()
  // Consent is per funder now (the block under the form): Trade Lenda's row.
  const consent = page
    .getByTestId('consent-block')
    .getByRole('checkbox', { name: 'Trade Lenda', exact: true })
  if (!(await consent.isChecked())) {
    await consent.click()
    await expect(consent).toBeChecked({ timeout: 20_000 })
  }
  for (const id of ['phone', 'figures']) {
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
    const costs = await ogaCosts()
    await loginAsStaff(page)
    for (const type of ['customer', 'go4solar'] as const) {
      // A fresh test person per lending type: someone already in an active batch cannot go in a
      // new one.
      const lead = await newTestLead()
      await completeProfile(page, lead.id)
      await page.goto(`/admin/waitlist/${lead.id}/edit`)
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
      await page.getByLabel('Search name, phone or email').fill(lead.phone.slice(-7))
      await page.getByRole('checkbox', { name: /Send Ada Testcustomer/ }).check()
      await page.getByTestId('send-to-tl').click()
      await expect(page.getByTestId('send-notice')).toContainText(/Sent as TLT-Batch-\d{3}/, {
        timeout: 60_000,
      })
      // Now in an active batch: no tick box for a NEW batch, "Sent in …" instead.
      await page.reload()
      await page.getByLabel('Search name, phone or email').fill(lead.phone.slice(-7))
      await expect(page.getByTestId(`sent-in-${lead.id}`)).toContainText(/^Sent in TLT-Batch-\d{3}/)
      await expect(page.getByTestId(`profile-row-${lead.id}`).getByRole('checkbox')).toHaveCount(0)

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

    // To change a sent person's details: "Send updated version" (same number, new version).
    await page.goto('/admin/waitlist/batches?test=1')
    const newest = page.getByTestId('admin-batches').locator('li').first()
    const title = (await newest.getByRole('link').first().innerText()).split(' · ')[0]!
    await newest.getByRole('button', { name: 'Send updated version' }).click()
    await expect(page.getByTestId('admin-batches').locator('li').first()).toContainText(
      `${title} v2`,
      { timeout: 60_000 },
    )
  })
})
