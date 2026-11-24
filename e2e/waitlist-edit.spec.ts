import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

/**
 * Admin → Waiting list → Edit (both tabs) and the per-funder consent block (migration 0043).
 * Test data only: a test person (+234800000… phone) made here; nothing is exported, so withdrawing
 * consent emails no funder.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = {
  apikey: key!,
  Authorization: `Bearer ${key}`,
  'content-type': 'application/json',
  Prefer: 'return=representation',
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

async function migrated(): Promise<boolean> {
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/lead_funder_consents?select=funder_id&limit=1`, {
    headers,
  })
  return res.ok
}

async function incompleteTestLead(): Promise<string> {
  const phone = `+234800000${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`
  const res = await fetch(`${url}/rest/v1/waitlist_consumers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      phone_e164: phone,
      visitor_token_hash: `e2e-edit-${Date.now()}`,
      status: 'incomplete',
      first_name: 'Edit',
      surname: 'Testperson',
      state: 'Kaduna',
      consent: true,
      consent_at: new Date().toISOString(),
      load_items: [],
      load_totals: {},
    }),
  })
  expect(res.ok).toBe(true)
  const [row] = (await res.json()) as { id: string; is_test: boolean }[]
  expect(row!.is_test).toBe(true)
  return row!.id
}

test('waiting list → Edit (Incomplete tab) → consent per funder: tick, then withdraw (audited)', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!(await migrated()), 'migration 0043 not applied')
  test.setTimeout(300_000)
  const id = await incompleteTestLead()
  await loginAsStaff(page)

  // The Incomplete tab: a Profile column and an Edit button on the row.
  await page.goto('/admin/waitlist?tab=incomplete&test=1')
  const edit = page.locator(`a[href="/admin/waitlist/${id}/edit"]`)
  await expect(edit).toBeVisible({ timeout: 30_000 })
  const row = page.getByTestId('consumer-row').filter({ has: edit })
  await expect(row.getByTestId('profile-readiness')).toContainText(/\d+ of \d+/)
  await edit.click()
  await page.waitForURL(new RegExp(`/admin/waitlist/${id}/edit$`))
  await expect(page.getByRole('link', { name: '‹ Waiting list' })).toBeVisible()
  // Pre-filled from the waiting list.
  await expect(page.getByTestId('profile-form').getByLabel('First name')).toHaveValue('Edit')

  // Consent block: every active funder, nothing ticked yet, not ready to export.
  const block = page.getByTestId('consent-block')
  const tl = block.getByRole('checkbox', { name: 'Trade Lenda', exact: true })
  await expect(tl).not.toBeChecked()
  const tlRow = block.locator('[data-testid="consent-funder"][data-funder="Trade Lenda"]')
  await expect(tlRow.getByTestId('consent-level')).toContainText('Not ready to export')

  await tlRow.getByLabel('Trade Lenda: note').fill('Agreed on the call (e2e)')
  await tl.click()
  await expect(tl).toBeChecked({ timeout: 20_000 })
  await expect(tlRow.getByTestId('consent-who')).toContainText('Agreed on the call (e2e)')

  // Withdraw: confirm, then it shows as withdrawn; nothing was exported, so no funder email.
  await tl.click()
  await tlRow.getByRole('button', { name: 'Withdraw consent' }).click()
  await expect(tlRow.getByTestId('consent-withdrawn')).toBeVisible({ timeout: 20_000 })
  await expect(tl).not.toBeChecked()

  const [c] = await rest<{ withdrawn_at: string | null; funder_told_at: string | null }[]>(
    `lead_funder_consents?select=withdrawn_at,funder_told_at&waitlist_id=eq.${id}`,
  )
  expect(c!.withdrawn_at).toBeTruthy()
  expect(c!.funder_told_at).toBeNull()
  const audit = await rest<{ action: string }[]>(
    `audit_log?select=action&entity_id=eq.${id}&action=like.lead_consent.*&order=created_at`,
  )
  expect(audit.map((a) => a.action)).toEqual(['lead_consent.on', 'lead_consent.withdraw'])
  const mail = await rest<unknown[]>(
    `outbox?select=id&template=eq.consent_withdrawn&payload->>text=like.*${id}*`,
  )
  expect(mail).toHaveLength(0)
})

test('the old profile address forwards to Edit', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!(await migrated()), 'migration 0043 not applied')
  const id = await incompleteTestLead()
  await loginAsStaff(page)
  await page.goto(`/admin/waitlist/${id}/profile`)
  await page.waitForURL(new RegExp(`/admin/waitlist/${id}/edit$`))
})
