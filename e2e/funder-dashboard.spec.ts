import { expect, test } from '@playwright/test'

import { withTestExportQueue } from './helpers/exportQueue'
import { loginAsStaff } from './helpers/staff'
import { TEST_FUNDER_NAME } from './helpers/test-identity'

/**
 * PR C: any funder's dashboard, "View as [funder]", onboarding links (domain rule), Send by
 * WhatsApp / email, Discard queue. Test data only: the E2E TEST FUNDER (given a test batch prefix
 * and the example.org domain here; real funders are never changed) and test people.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = {
  apikey: key!,
  Authorization: `Bearer ${key}`,
  'content-type': 'application/json',
  Prefer: 'return=representation',
}
async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

async function testPerson(
  staffId: string,
  funderId: string,
): Promise<{ id: string; email: string; phone: string }> {
  const phone = `+234800000${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`
  const email = `e2e-onboard-${Date.now()}@go4solar.test`
  const [lead] = await rest<{ id: string }[]>('waitlist_consumers', {
    method: 'POST',
    body: JSON.stringify({
      phone_e164: phone,
      whatsapp_e164: phone,
      email,
      first_name: 'Onboard',
      surname: 'Testperson',
      visitor_token_hash: `e2e-onboard-${Date.now()}`,
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
  const now = new Date().toISOString()
  await rest('lead_profiles', {
    method: 'POST',
    body: JSON.stringify({
      waitlist_id: lead!.id,
      street: '1 Test Street',
      landmark: 'Near the test market',
      plan_kind: 'ready',
      plan_ref: 'oga-boss',
      deposit_share: 0.2,
      months: 12,
      phone_verified_at: now,
      phone_verified_by: staffId,
      figures_agreed_at: now,
      figures_agreed_by: staffId,
      is_test: true,
    }),
  })
  await rest('lead_funder_consents', {
    method: 'POST',
    body: JSON.stringify({
      waitlist_id: lead!.id,
      funder_id: funderId,
      consented_at: now,
      consented_by: staffId,
      is_test: true,
    }),
  })
  return { id: lead!.id, email, phone }
}

test('export to a funder → View as → onboarding link (domain rule) → Send by email / WhatsApp → Discard', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!url || !key, 'needs Supabase env')
  test.setTimeout(500_000)
  const [staff] = await rest<{ id: string }[]>(
    `profiles?select=id&email=eq.${encodeURIComponent(process.env.E2E_STAFF_EMAIL!)}`,
  )
  // The test funder: a test batch prefix and the example.org onboarding domain (test data only).
  const [funder] = await rest<{ id: string; is_test: boolean }[]>(
    `funders?name=eq.${encodeURIComponent(TEST_FUNDER_NAME)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ batch_prefix: 'ET', onboarding_domains: ['example.org'] }),
    },
  )
  expect(funder!.is_test).toBe(true)
  const person = await testPerson(staff!.id, funder!.id)
  const other = await testPerson(staff!.id, funder!.id)
  await loginAsStaff(page)

  await withTestExportQueue(async () => {
    await rest('export_queues?status=eq.draft&is_test=eq.true', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'discarded' }),
    })
    // Discard: a queue with "other" in it, discarded → nothing exported, no batch.
    await page.goto('/admin/waitlist?tab=complete&test=1')
    const rowOf = (id: string) =>
      page
        .getByTestId('consumer-row')
        .filter({ has: page.locator(`a[href="/admin/waitlist/${id}/edit"]`) })
    await rowOf(other.id).getByTestId('select-entry').check({ timeout: 30_000 })
    await page.getByTestId('add-to-queue').click()
    await expect(page.getByTestId('queue-bar-message')).toContainText(/Added 1 to EXPT-/, {
      timeout: 30_000,
    })
    await page.goto('/admin/exports/queue?test=1')
    await page.getByTestId('discard-queue').click()
    await page.getByTestId('confirm-discard').click()
    await page.waitForURL(/\/admin\/exports(\?|$)/, { timeout: 60_000 })
    expect(
      await rest<unknown[]>(`funder_batch_items?select=id&waitlist_id=eq.${other.id}`),
    ).toHaveLength(0)

    // Export "person" to the test funder.
    await page.goto('/admin/waitlist?tab=complete&test=1')
    await rowOf(person.id).getByTestId('select-entry').check({ timeout: 30_000 })
    await page.getByTestId('add-to-queue').click()
    await expect(page.getByTestId('queue-bar-message')).toContainText(/Added 1 to EXPT-/, {
      timeout: 30_000,
    })
    await page.goto(`/admin/exports/queue?test=1&funder=${funder!.id}&mode=basic`)
    await expect(
      page.locator(`[data-testid="queue-row"][data-id="${person.id}"]`).getByTestId('queue-level'),
    ).toHaveText('Basic', { timeout: 60_000 })
    await page.getByTestId('export-queue').click()
    await page.waitForURL(/\/admin\/exports(\?|$)/, { timeout: 120_000 })
  })
  const [item] = await rest<{ id: string; batch_id: string; funder_batches: { number: string } }[]>(
    `funder_batch_items?select=id,batch_id,funder_batches(number)&waitlist_id=eq.${person.id}`,
  )
  expect(item!.funder_batches.number).toMatch(/^ETT-Batch-\d{3}$/)

  // View as the test funder: its name, its batch, the onboarding link box.
  await page.goto(`/admin/funder?test=1&as=${funder!.id}`)
  await expect(page.getByTestId('view-as')).toContainText(`Viewing as ${TEST_FUNDER_NAME}`)
  await page.goto(`/admin/funder/${item!.batch_id}?as=${funder!.id}`)
  const box = page.getByLabel('Onboarding link for Onboard Testperson')
  await box.fill('https://evil.com/onboard')
  await page.getByTestId('item-link').getByRole('button', { name: 'Save link' }).click()
  await expect(page.getByTestId('item-link')).toContainText('must be on example.org')
  await box.fill('https://onboard.example.org/start?ref=e2e')
  await page.getByTestId('item-link').getByRole('button', { name: 'Save link' }).click()
  await expect(page.getByTestId('item-link')).toContainText('Saved.', { timeout: 30_000 })

  // Our side: the person's Edit page shows the link; send by email (outbox) and WhatsApp.
  await page.goto(`/admin/waitlist/${person.id}/edit`)
  const link = page.getByTestId('onboarding-link')
  await expect(link).toContainText('https://onboard.example.org/start?ref=e2e', { timeout: 30_000 })
  const wa = await link.getByTestId('send-whatsapp').getAttribute('href')
  expect(wa).toMatch(new RegExp(`^https://wa\\.me/${person.phone.slice(1)}\\?text=`))
  expect(decodeURIComponent(wa!.split('?text=')[1]!)).toContain(
    'https://onboard.example.org/start?ref=e2e',
  )
  await link.getByTestId('send-email').click()
  await expect(link).toContainText('Emailed to the customer.', { timeout: 30_000 })
  await expect(link.getByTestId('onboarding-sends')).toContainText('Sent by email', {
    timeout: 30_000,
  })
  const mail = await rest<{ payload: { text: string } }[]>(
    `outbox?select=payload&template=eq.onboarding_link&to=eq.${encodeURIComponent(person.email)}`,
  )
  expect(mail[0]!.payload.text).toContain('https://onboard.example.org/start?ref=e2e')
  const sends = await rest<{ channel: string }[]>(
    `onboarding_link_sends?select=channel&batch_item_id=eq.${item!.id}`,
  )
  expect(sends.map((x) => x.channel)).toContain('email')
})

test('SPEWA’s approver sees SPEWA approvals and SPEWA’s batches', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!process.env.E2E_SPEWA_EMAIL, 'no funder approver test account')
  await loginAsStaff(page, 'spewa')
  const nav = page.getByRole('navigation').filter({ hasText: 'SPEWA approvals' }).first()
  await expect(nav.getByRole('link')).toHaveText(['SPEWA approvals', 'Batches'])
  await page.goto('/admin/funder')
  await expect(page.getByRole('heading', { level: 1, name: 'Batches' })).toBeVisible()
  await expect(page.getByTestId('view-as')).toHaveCount(0)
})

test('super admin menu: “Funder view (View as)” opens the funder view', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  await loginAsStaff(page)
  await page
    .getByRole('navigation', { name: 'Back office' })
    .getByRole('link', { name: 'Funder view (View as)' })
    .click()
  await page.waitForURL(/\/admin\/funder(\?|$)/)
  await expect(page.getByTestId('view-as')).toContainText('View as:')
})
