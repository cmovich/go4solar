import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'

/**
 * SPEWA approvals never break on a broken file: an old TEST file in the queue whose stored quote
 * is empty shows "Quote details unavailable" (queue row and file page); the page itself loads.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: key!, Authorization: `Bearer ${key}` }
async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return (await res.json()) as T
}

/** A queued test file whose quote has no usable figures (old test data), if any. */
async function brokenQueuedFile(): Promise<string | null> {
  const queued = await rest<{ application_id: string }[]>(
    'funder_queue?select=application_id&is_test=eq.true',
  )
  for (const { application_id } of queued) {
    const [a] = await rest<{ quote_id: string | null }[]>(
      `applications?select=quote_id&id=eq.${application_id}`,
    )
    if (!a?.quote_id) continue
    const [q] = await rest<{ result: { systemPrice?: unknown } | null }[]>(
      `quotes?select=result&id=eq.${a.quote_id}`,
    )
    if (typeof q?.result?.systemPrice !== 'number') return application_id
  }
  return null
}

test('SPEWA approvals and a file with a broken quote: no crash, "Quote details unavailable"', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  test.skip(!url || !key, 'needs Supabase env')
  await loginAsStaff(page)
  await page.goto('/admin/spewa?show=all&test=1')
  await expect(page.getByRole('heading', { level: 1, name: 'SPEWA approvals' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByTestId('spewa-error')).toHaveCount(0)
  const broken = await brokenQueuedFile()
  test.skip(!broken, 'no queued test file with a broken quote')
  await expect(
    page.getByTestId(`spewa-row-${broken}`).getByTestId('quote-unavailable'),
  ).toBeVisible()
  await page.goto(`/admin/spewa/${broken}`)
  await expect(page.getByTestId('quote-unavailable')).toHaveText('Quote details unavailable')
})
