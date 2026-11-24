import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

/**
 * "Trade Lenda profiles" is retired (24 Nov 2026): everyone is managed from Admin → Waiting list.
 * Reads with the service role; edits only a TEST entry.
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

test('Trade Lenda profiles forwards to the waiting list; Incomplete row → Edit → attach a staff quotation', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!url || !key, 'needs Supabase env')
  test.setTimeout(400_000)
  await loginAsStaff(page)
  // Retired 24 Nov: the old page forwards to Admin → Waiting list.
  await page.goto('/admin/waitlist/profiles')
  await expect(page).toHaveURL(/\/admin\/waitlist(\?|$)/)

  // A test person who stopped part-way and has no profile yet.
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
  await page.goto('/admin/waitlist?tab=incomplete&test=1')
  const edit = page.locator(`a[href="/admin/waitlist/${lead!.id}/edit"]`)
  await expect(edit).toBeVisible({ timeout: 30_000 })
  const row = page.getByTestId('consumer-row').filter({ has: edit })
  await expect(row.getByTestId('profile-readiness')).toHaveText(/^\d+ of 15$/)

  // No plan yet: attach a (test) staff quotation during the call.
  const [sq] = await rows<{ public_code: string }>(
    'staff_quotations?select=public_code&is_test=eq.true&order=created_at.desc&limit=1',
  )
  test.skip(!sq, 'no test staff quotation to attach')
  await edit.click()
  await page.waitForURL(new RegExp(`/admin/waitlist/${lead!.id}/edit$`))
  await page
    .getByLabel(/Or attach a staff quotation/)
    .fill(`https://go4solar.app/q/${sq!.public_code}`)
  await page.getByTestId('profile-save').click()
  await expect(page.getByText('Profile saved.')).toBeVisible({ timeout: 30_000 })
  const [p] = await rows<{ plan_ref: string | null }>(
    `lead_profiles?select=plan_ref&waitlist_id=eq.${lead!.id}`,
  )
  expect(p?.plan_ref).toContain(sq!.public_code)
  // Total entries (real) still all listed: Complete + Incomplete tabs together.
  expect(
    await count('waitlist_consumers?select=id&is_test=eq.false&cleared_at=is.null'),
  ).toBeGreaterThan(0)
})
