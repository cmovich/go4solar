import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

/**
 * Admin → Trade Lenda profiles lists EVERY waiting-list person (finished sign-up or not). Reads
 * counts with the service role; edits only a TEST entry.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: key!, Authorization: `Bearer ${key}` }

async function count(path: string): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
  })
  return Number(res.headers.get('content-range')?.split('/')[1] ?? 0)
}
async function rows<T>(path: string): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers })
  return res.ok ? ((await res.json()) as T[]) : []
}

test('every waiting-list person is listed; filters, search, attach a staff quotation', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!url || !key, 'needs Supabase env')
  test.setTimeout(400_000)
  const real = await count('waitlist_consumers?select=id&is_test=eq.false&cleared_at=is.null')
  await loginAsStaff(page)
  await page.goto('/admin/waitlist/profiles')
  // All real entries, complete sign-ups or not (was: finished sign-ups only).
  await expect(page.getByTestId('filter-all')).toHaveText(`All (${real})`, { timeout: 30_000 })

  // A test person who stopped part-way and has no profile yet: "Not started".
  const [lead] = await rows<{ id: string; phone_e164: string }>(
    'waitlist_consumers?select=id,phone_e164&is_test=eq.true&status=eq.incomplete&cleared_at=is.null&order=created_at.desc&limit=20',
  ).then(async (list) => {
    const withProfile = new Set(
      (
        await rows<{ waitlist_id: string }>(
          `lead_profiles?select=waitlist_id&waitlist_id=in.(${list.map((l) => l.id).join(',') || '00000000-0000-0000-0000-000000000000'})`,
        )
      ).map((p) => p.waitlist_id),
    )
    return list.filter((l) => !withProfile.has(l.id))
  })
  test.skip(!lead, 'no test person without a profile')
  await page.goto('/admin/waitlist/profiles?test=1')
  await page.getByLabel('Search name, phone or email').fill(lead!.phone_e164.slice(-7))
  const status = page.getByTestId(`profile-status-${lead!.id}`)
  await expect(status).toContainText(/^Not started · \d+ of \d+$/)
  await page.getByTestId('filter-not_started').click()
  await expect(status).toBeVisible()
  await page.getByTestId('filter-ready').click()
  await expect(status).toHaveCount(0)
  // The phone number calls on a phone.
  await page.getByTestId('filter-all').click()
  await expect(
    page.getByTestId(`profile-row-${lead!.id}`).getByRole('link', { name: lead!.phone_e164 }),
  ).toHaveAttribute('href', `tel:${lead!.phone_e164}`)

  // No plan yet: attach a (test) staff quotation during the call.
  const [sq] = await rows<{ public_code: string }>(
    'staff_quotations?select=public_code&is_test=eq.true&order=created_at.desc&limit=1',
  )
  test.skip(!sq, 'no test staff quotation to attach')
  await page.goto(`/admin/waitlist/${lead!.id}/edit`)
  await page
    .getByLabel(/Or attach a staff quotation/)
    .fill(`https://go4solar.app/q/${sq!.public_code}`)
  await page.getByTestId('profile-save').click()
  await expect(page.getByText('Profile saved.')).toBeVisible({ timeout: 30_000 })
  await page.goto('/admin/waitlist/profiles?test=1')
  await page.getByLabel('Search name, phone or email').fill(lead!.phone_e164.slice(-7))
  await expect(page.getByTestId(`profile-row-${lead!.id}`)).toContainText(
    `Staff quotation ${sq!.public_code}`,
  )
  // A saved profile row now exists: "Incomplete".
  await expect(status).toContainText(/^Incomplete · /)
})
