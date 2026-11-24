import { expect, test } from '@playwright/test'

import { hasDb, loginAsStaff } from './helpers'

/**
 * "Apply again" (24 Nov 2026), live mode. One leftover TEST application waiting for a decision
 * (made by the live journey; customer password 'Solar-Plan-2026!') is declined by staff with
 * "Customer may apply again" ticked; the customer then sees the box on My account, and the button
 * starts a new application (quotation still valid) or opens a new quotation (expired).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: key!, Authorization: `Bearer ${key}` }
async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

type App = {
  id: string
  consumer_id: string
  quote_id: string
  personal: { email?: string } | null
}

/** A test application waiting for a decision, not in the SPEWA queue, quote on file. */
async function freeFile(): Promise<App | null> {
  const [apps, queued] = await Promise.all([
    rest<App[]>(
      'applications?select=id,consumer_id,quote_id,personal&status=eq.submitted&quote_id=not.is.null&order=submitted_at.desc.nullslast&limit=100',
    ),
    rest<{ application_id: string }[]>('funder_queue?select=application_id'),
  ])
  const routed = new Set(queued.map((q) => q.application_id))
  for (const a of apps) {
    if (routed.has(a.id) || !a.personal?.email?.endsWith('@go4solar.test')) continue
    const [p] = await rest<{ is_test: boolean }[]>(`profiles?select=is_test&id=eq.${a.consumer_id}`)
    if (p?.is_test) return a
  }
  return null
}

test('declined with "Customer may apply again" → Apply again on My account', async ({ page }) => {
  test.skip(!hasDb, 'needs Supabase env')
  test.setTimeout(400_000)
  const app = await freeFile()
  test.skip(!app, 'no free test application (run the live journey to make one)')

  // Staff: decline with the tick and a note.
  const staff = await page.context().browser()!.newPage({ storageState: 'e2e/storage-state.json' })
  await loginAsStaff(staff)
  await staff.goto(`/admin/applications/${app!.id}`)
  await staff.getByLabel(/^Decline/).fill('Guarantor did not sign (e2e)')
  await staff.getByTestId('may-apply-again').check()
  await staff.getByLabel('Customer may apply again: note').fill('A new guarantor is fine')
  staff.once('dialog', (d) => d.accept())
  await staff.getByRole('button', { name: 'Decline and refund' }).click()
  await expect(staff.getByText(/Declined\./)).toBeVisible({ timeout: 60_000 })
  await staff.close()
  const [declined] = await rest<
    { status: string; credit_flags: { mayApplyAgain?: { note: string } } }[]
  >(`applications?select=status,credit_flags&id=eq.${app!.id}`)
  expect(declined!.status).toBe('declined')
  expect(declined!.credit_flags.mayApplyAgain?.note).toBe('A new guarantor is fine')

  // Customer: My account shows the box; the button goes on.
  await page.goto('/login')
  await page.getByLabel('Email').fill(app!.personal!.email!)
  await page.getByLabel('Password').fill('Solar-Plan-2026!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/app(\?|$)/, { timeout: 60_000 })
  const box = page.getByTestId('apply-again')
  await expect(box).toBeVisible({ timeout: 30_000 })
  const [q] = await rest<{ valid_until: string }[]>(
    `quotes?select=valid_until&id=eq.${app!.quote_id}`,
  )
  const valid = new Date(q!.valid_until).getTime() >= Date.now()
  await expect(page.getByTestId('apply-again-button')).toHaveText(
    valid ? 'Apply again' : 'Get an up-to-date quotation',
  )
  await page.getByTestId('apply-again-button').click()
  if (valid) {
    await page.waitForURL(/\/app\/apply/, { timeout: 60_000 })
    const live = await rest<{ id: string; status: string }[]>(
      `applications?select=id,status&quote_id=eq.${app!.quote_id}&status=eq.draft`,
    )
    expect(live.length).toBe(1)
  } else {
    await page.waitForURL(/\/(get-started|build|plans\/)/, { timeout: 60_000 })
  }
})
