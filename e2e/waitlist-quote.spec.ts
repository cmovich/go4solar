import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

/**
 * Admin → Waiting list (both tabs) and Edit: "View quote" / "Download PDF", or "No quote yet".
 * Test data only: two test people (+234800000… phones) made here.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = {
  apikey: key!,
  Authorization: `Bearer ${key}`,
  'content-type': 'application/json',
  Prefer: 'return=representation',
}

// A 1 kVA builder system on the ready-made terms (Semako's Kaduna figures).
const quote = {
  costPrice: 457_500,
  systemPrice: 643_871,
  markupShare: 0.03,
  lines: [
    {
      sku: 'INV-1',
      name: '1 kVA hybrid inverter',
      category: 'inverter',
      unitCost: 257_500,
      qty: 1,
      unitPrice: 265_225,
      lineTotal: 265_225,
    },
  ],
  installCost: 200_000,
  noMarkup: [
    { label: 'Installation', amount: 100_000 },
    { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
  ],
  deposit: 93_045,
  balance: 550_826,
  instalments: [...Array(11).fill(45_902), 45_904],
  monthly: 45_902,
  planCharge: { label: 'Payment plan charge (12 months, 48%)', amount: 178_646 },
  snapshot: {
    version: 1,
    lines: [
      {
        sku: 'INV-1',
        name: '1 kVA hybrid inverter',
        category: 'inverter',
        unitCost: 257_500,
        qty: 1,
      },
    ],
    installCost: 200_000,
    noMarkup: [
      { label: 'Installation', amount: 100_000 },
      { label: 'Delivery — Go4Solar logistics (Kaduna)', amount: 100_000 },
    ],
    marginByCategory: { panels: 0.03, battery: 0.03, inverter: 0.03, accessories: 0.03 },
    pricingRateAnnual: 0.48,
    tenureMonths: 12,
    depositShare: 0.2,
    minDepositShare: 0.2,
    roundingStep: 100,
    terms: { kind: 'flat', monthlyRate: 0.04, fullDiscount: 0.2 },
  },
}

async function testLead(name: string, builder: unknown): Promise<string> {
  const phone = `+234800000${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`
  const res = await fetch(`${url}/rest/v1/waitlist_consumers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      phone_e164: phone,
      visitor_token_hash: `e2e-quote-${Date.now()}-${name}`,
      status: 'complete',
      first_name: name,
      surname: 'Quotetest',
      state: 'Kaduna',
      consent: true,
      consent_at: new Date().toISOString(),
      load_items: [],
      load_totals: {},
      builder,
    }),
  })
  expect(res.ok, await res.clone().text()).toBe(true)
  const [row] = (await res.json()) as { id: string; is_test: boolean }[]
  expect(row!.is_test).toBe(true)
  return row!.id
}

test('waiting list: View quote / Download PDF (items without prices), or No quote yet', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!url || !key, 'needs Supabase env')
  test.setTimeout(300_000)
  const withQuote = await testLead('Withquote', { kind: 'builder', sample: false, quote })
  const without = await testLead('Noquote', null)
  await loginAsStaff(page)

  await page.goto('/admin/waitlist?tab=complete&test=1')
  const rowOf = (id: string) =>
    page
      .getByTestId('consumer-row')
      .filter({ has: page.locator(`a[href="/admin/waitlist/${id}/edit"]`) })
  await expect(rowOf(without).getByTestId('no-quote')).toHaveText('No quote yet', {
    timeout: 60_000,
  })
  await expect(rowOf(withQuote).getByTestId('download-quote')).toHaveAttribute(
    'href',
    `/api/admin/waitlist/${withQuote}/quote`,
  )
  await rowOf(withQuote).getByTestId('view-quote').click()
  await page.waitForURL(`**/admin/waitlist/${withQuote}/quote`)
  const q = page.getByTestId('quotation')
  await expect(q).toContainText('Your own system', { timeout: 30_000 })
  await expect(page.getByTestId('quotation-lines')).toContainText('1 kVA hybrid inverter')
  await expect(page.getByTestId('quotation-lines')).not.toContainText('₦')
  await expect(page.getByTestId('quotation-total')).toHaveText('₦643,871')
  await expect(page.getByTestId('quotation-full-payment')).toContainText('₦515,097')
  await expect(q).not.toContainText(/interest|payment plan charge/i)

  const pdf = await page.request.get(`/api/admin/waitlist/${withQuote}/quote`)
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')

  // Edit page: the same links, or "No quote yet".
  await page.goto(`/admin/waitlist/${withQuote}/edit`)
  await expect(page.getByTestId('edit-quote').getByTestId('view-quote')).toBeVisible({
    timeout: 30_000,
  })
  await page.goto(`/admin/waitlist/${without}/edit`)
  await expect(page.getByTestId('edit-quote')).toContainText('No quote yet', { timeout: 30_000 })

  // Signed out: no PDF.
  const anon = await page.context().browser()!.newContext()
  const res = await anon.request.get(
    `${new URL(page.url()).origin}/api/admin/waitlist/${withQuote}/quote`,
  )
  expect(res.status()).toBe(401)
  await anon.close()
})
