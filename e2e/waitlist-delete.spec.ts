import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { expect, test } from '@playwright/test'

import { loginAsStaff } from './helpers/staff'
import { testPhone, toE164 } from './helpers/test-identity'

// Part W: delete a waiting-list entry with a reason; the audit log keeps who, why and the old row.
config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const serviceClient = () => createClient(url!, service!, { auth: { persistSession: false } })

/** Two complete test entries with the same phone (so both show "Possible duplicate"). */
async function seedPair(surname: string) {
  const phone = toE164(testPhone())
  const rows = [1, 2].map((n) => ({
    status: 'complete' as const,
    visitor_token_hash: `e2e-delete-${surname}-${n}`,
    phone_e164: phone,
    first_name: `Delete${n}`,
    surname,
    state: 'Lagos',
  }))
  const { data, error } = await serviceClient().from('waitlist_consumers').insert(rows).select('id')
  if (error) throw error
  return { phone, ids: data.map((r) => r.id) }
}

test.describe('waiting-list delete', () => {
  test.beforeEach(() => {
    test.skip(!url || !service || !process.env.E2E_STAFF_EMAIL, 'needs Supabase env')
    // Desktop only: a staff authenticator code cannot be used twice in one 30 s window.
    test.skip(test.info().project.name !== 'desktop', 'staff login runs once, on desktop')
  })

  test('super admin deletes with a reason → row gone → audit shows who, why and the old row', async ({
    page,
  }) => {
    const surname = `W${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const { phone, ids } = await seedPair(surname)
    const [first] = ids

    await loginAsStaff(page)
    await page.goto('/admin/waitlist?tab=complete&test=1')
    const row = page.getByTestId('consumer-row').filter({ hasText: `Delete1 ${surname}` })
    await expect(row).toBeVisible()
    await expect(row.getByTestId('possible-duplicate')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Delete all test entries \(\d+\)/ }),
    ).toBeVisible()

    await row.getByRole('button', { name: `Delete Delete1 ${surname}` }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Delete this entry?')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
    await dialog.getByLabel('Duplicate').check()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(row).toBeHidden()
    // The sheet must not have opened from the click.
    await expect(page.getByText('Complete sign-up ·')).toHaveCount(0)

    // After a reload the row stays gone and the twin is no longer a duplicate of anything.
    await page.reload()
    await expect(row).toHaveCount(0)
    const twin = page.getByTestId('consumer-row').filter({ hasText: `Delete2 ${surname}` })
    await expect(twin).toBeVisible()
    await expect(twin.getByTestId('possible-duplicate')).toHaveCount(0)

    // Database: gone, and both audit rows name the staff member.
    const db = serviceClient()
    const { data: left } = await db.from('waitlist_consumers').select('id').eq('id', first!)
    expect(left).toEqual([])
    const { data: audit } = await db
      .from('audit_log')
      .select('action, actor_email, actor_role, before, after')
      .eq('entity_id', first!)
      .order('created_at')
    const app = audit?.find((a) => a.action === 'waitlist.delete')
    const trigger = audit?.find((a) => a.action === 'db.delete')
    expect(app).toMatchObject({
      actor_email: process.env.E2E_STAFF_EMAIL,
      actor_role: 'super_admin',
      after: { reason: 'duplicate' },
      before: { id: first, phone_e164: phone, surname },
    })
    expect(trigger).toMatchObject({
      actor_email: process.env.E2E_STAFF_EMAIL,
      before: { id: first, phone_e164: phone },
    })

    // Audit log page: the entry with the reason and the full old row.
    await page.goto('/admin/audit?action=waitlist.')
    const entry = page.getByTestId('audit-table').locator('tr').filter({ hasText: first! })
    await expect(entry).toContainText('Deleted a waiting-list entry')
    await expect(entry).toContainText(process.env.E2E_STAFF_EMAIL!)
    await expect(entry).toContainText('duplicate')
    await entry.getByText('Full old row (for restoring)').click()
    await expect(entry.getByTestId('audit-old-row')).toContainText(surname)

    await db.from('waitlist_consumers').delete().in('id', ids)
  })

  test('a staff member without the permission cannot delete (no button, and the database refuses)', async ({
    page,
  }) => {
    test.skip(!process.env.E2E_OPS_EMAIL, 'needs the operations test user')
    const surname = `W${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const { ids } = await seedPair(surname)

    await loginAsStaff(page, 'ops')
    await page.goto('/admin/waitlist?tab=complete&test=1')
    const row = page.getByTestId('consumer-row').filter({ hasText: `Delete1 ${surname}` })
    await expect(row).toBeVisible()
    await expect(row.getByRole('button', { name: /^Delete / })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Delete all test entries/ })).toHaveCount(0)

    // Straight to the database as that person: RLS deletes nothing.
    const asOps = createClient(url!, anon!, { auth: { persistSession: false } })
    await asOps.auth.signInWithPassword({
      email: process.env.E2E_OPS_EMAIL!,
      password: process.env.E2E_OPS_PASSWORD!,
    })
    const { data: deleted } = await asOps
      .from('waitlist_consumers')
      .delete()
      .in('id', ids)
      .select('id')
    expect(deleted ?? []).toEqual([])
    const { data: still } = await serviceClient()
      .from('waitlist_consumers')
      .select('id')
      .in('id', ids)
    expect(still).toHaveLength(2)

    await serviceClient().from('waitlist_consumers').delete().in('id', ids)
  })
})
