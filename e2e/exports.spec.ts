import { expect, test } from '@playwright/test'

import { withTestExportQueue } from './helpers/exportQueue'
import { loginAsStaff } from './helpers/staff'

/**
 * Waiting list → export queue → Trade Lenda batch (PR B, migration 0043). Test data only: a test
 * person (+234800000… phone) seeded with a ready Basic profile; the batch is a test batch
 * (TLT-Batch-…). A leftover open TEST queue from an interrupted run is marked discarded first.
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

async function ready(): Promise<boolean> {
  if (!url || !key) return false
  return (await fetch(`${url}/rest/v1/export_queues?select=id&limit=1`, { headers })).ok
}

/** A test person with a ready Basic profile, phone confirmed, figures agreed, consent for TL. */
async function readyTestPerson(staffId: string, tlId: string): Promise<string> {
  const phone = `+234800000${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`
  const [lead] = await rest<{ id: string; is_test: boolean }[]>('waitlist_consumers', {
    method: 'POST',
    body: JSON.stringify({
      phone_e164: phone,
      whatsapp_e164: phone,
      email: `e2e-export-${Date.now()}@go4solar.test`,
      first_name: 'Export',
      surname: 'Testperson',
      visitor_token_hash: `e2e-export-${Date.now()}`,
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
  expect(lead!.is_test).toBe(true)
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
      funder_id: tlId,
      consented_at: now,
      consented_by: staffId,
      consent_note: 'e2e',
      is_test: true,
    }),
  })
  return lead!.id
}

test('waiting list → Add to export queue → export Basic to Trade Lenda → Exported badge', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!(await ready()), 'migration 0043 not applied')
  test.setTimeout(400_000)
  const [staff] = await rest<{ id: string }[]>(
    `profiles?select=id&email=eq.${encodeURIComponent(process.env.E2E_STAFF_EMAIL!)}`,
  )
  const [tl] = await rest<{ id: string }[]>('funders?select=id&batch_prefix=eq.TL')
  await withTestExportQueue(async () => {
    // A leftover open test queue (interrupted run): discarded, not deleted.
    await rest('export_queues?status=eq.draft&is_test=eq.true', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'discarded' }),
    })
    const id = await readyTestPerson(staff!.id, tl!.id)
    await loginAsStaff(page)

    // Waiting list: tick the person, Add to export queue (a new test queue EXPT-…).
    await page.goto('/admin/waitlist?tab=complete&test=1')
    const row = page.getByTestId('consumer-row').filter({
      has: page.locator(`a[href="/admin/waitlist/${id}/edit"]`),
    })
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(row.getByTestId('profile-readiness')).toHaveText('Basic ready')
    await row.getByTestId('select-entry').check()
    await page.getByTestId('add-to-queue').click()
    await expect(page.getByTestId('queue-bar-message')).toContainText(
      /Added 1 to EXPT-\d{4}-\d{4}/,
      {
        timeout: 30_000,
      },
    )

    // The queue: Trade Lenda, lends to customers, Basic for all → Basic; export.
    await page.goto(`/admin/exports/queue?test=1&funder=${tl!.id}&type=customer&mode=basic`)
    const qrow = page.locator(`[data-testid="queue-row"][data-id="${id}"]`)
    await expect(qrow.getByTestId('queue-level')).toHaveText('Basic', { timeout: 60_000 })
    await page.getByTestId('export-queue').click()
    await page.waitForURL(/\/admin\/exports(\?|$)/, { timeout: 120_000 })

    // The batch: a test Trade Lenda batch, Basic, with the financing figures.
    const [item] = await rest<
      {
        level: string
        snapshot: { financing: Record<string, number>; dateOfBirth: string | null }
        funder_batches: { number: string }
      }[]
    >(`funder_batch_items?select=level,snapshot,funder_batches(number)&waitlist_id=eq.${id}`)
    expect(item!.level).toBe('basic')
    expect(item!.funder_batches.number).toMatch(/^TLT-Batch-\d{3}$/)
    expect(item!.snapshot.financing).toMatchObject({
      financed: 1_045_600,
      earnings: 501_888,
      monthly: 128_957,
      totalRepayment: 1_547_488,
    })
    expect(item!.snapshot.dateOfBirth).toBeNull()
    await expect(page.getByTestId('exports-table')).toContainText(item!.funder_batches.number)

    // The waiting list marks the person as exported.
    await page.goto('/admin/waitlist?tab=complete&test=1')
    await expect(row.getByTestId('exported-badge')).toBeVisible({ timeout: 30_000 })
    const title = await row.getByTestId('exported-badge').getAttribute('title')
    expect(title).toContain(item!.funder_batches.number)
    expect(title).toContain('Basic')

    // Queued again for Trade Lenda: already in that batch → "Send updated version".
    await row.getByTestId('select-entry').check()
    await page.getByTestId('add-to-queue').click()
    await expect(page.getByTestId('queue-bar-message')).toContainText(/Added 1 to EXPT-/, {
      timeout: 30_000,
    })
    await page.goto(`/admin/exports/queue?test=1&funder=${tl!.id}&type=customer&mode=basic`)
    await expect(qrow.getByTestId('queue-level')).toContainText(
      `In ${item!.funder_batches.number}`,
      {
        timeout: 60_000,
      },
    )
    await expect(page.getByTestId('export-queue')).toBeDisabled()
    await qrow.getByRole('button', { name: 'Remove' }).click()
    await expect(qrow).toHaveCount(0, { timeout: 30_000 })

    // The CSV the funder receives: level and financing, nothing internal.
    const [batch] = await rest<{ id: string }[]>(
      `funder_batches?select=id&number=eq.${item!.funder_batches.number}&is_test=eq.true&order=version.desc&limit=1`,
    )
    const csv = await (await page.request.get(`/api/funder/batches/${batch!.id}?format=csv`)).text()
    expect(csv).toContain('Basic')
    expect(csv).toContain('501888')
    for (const w of ['margin', 'profit', 'vendor', 'cost price', 'unit cost', 'markup', 'bvn'])
      expect(csv.toLowerCase()).not.toContain(w)
  })
})
