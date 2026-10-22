import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { fakeSupabase } from '@/test/fakeSupabase'

// Part W: deleting waiting-list entries. The fake stands in for both the staff (RLS) client and
// the service-role client; the database's own RLS is covered by the e2e test.
let db = fakeSupabase()
let session: SessionInfo
let permitted = false

vi.mock('@/lib/auth/roles', () => ({ requireStaffWithMfa: async () => session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db.client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { deleteWaitlistEntry, deleteAllTestEntries } = await import('./actions')

const staff = (role: SessionInfo['role']): SessionInfo => ({
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'staff@go4solar.test' },
  role,
  aal: 'aal2',
})
const LEAD = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  db = fakeSupabase()
  db.defineFunction('has_permission', () => permitted)
  permitted = false
  session = staff('super_admin')
  db.seed('waitlist_consumers', {
    id: LEAD,
    phone_e164: '+2348000001234',
    first_name: 'Ada',
    visitor_token_hash: 'secret-hash',
    is_test: true,
  })
  db.seed('waitlist_consumers', {
    phone_e164: '+2348031112222',
    first_name: 'Real',
    is_test: false,
  })
  db.seed('waitlist_installers', {
    phone_e164: '+2348000005678',
    name: 'Test Installs',
    is_test: true,
  })
})

describe('deleteWaitlistEntry', () => {
  it('a super admin deletes with a reason; the audit row keeps the old row (minus the token hash)', async () => {
    const r = await deleteWaitlistEntry({ table: 'consumers', id: LEAD, reason: 'duplicate' })
    expect(r.ok).toBe(true)
    expect(db.rows('waitlist_consumers').map((x) => x.id)).not.toContain(LEAD)
    const [entry] = db.rows('audit_log')
    expect(entry).toMatchObject({
      actor_id: session.user!.id,
      action: 'waitlist.delete',
      entity: 'waitlist_consumers',
      entity_id: LEAD,
      after: { reason: 'duplicate', note: null },
    })
    expect(entry!.before).toMatchObject({
      id: LEAD,
      phone_e164: '+2348000001234',
      first_name: 'Ada',
    })
    expect(entry!.before).not.toHaveProperty('visitor_token_hash')
  })

  it('staff without the permission cannot delete; nothing changes', async () => {
    session = staff('operations')
    const r = await deleteWaitlistEntry({ table: 'consumers', id: LEAD, reason: 'test' })
    expect(r.ok).toBe(false)
    expect(db.rows('waitlist_consumers')).toHaveLength(2)
    expect(db.rows('audit_log')).toHaveLength(0)
  })

  it('staff with the waitlist_delete permission can delete', async () => {
    session = staff('operations')
    permitted = true
    const r = await deleteWaitlistEntry({
      table: 'installers',
      id: db.rows('waitlist_installers')[0]!.id,
      reason: 'test',
    })
    expect(r.ok).toBe(true)
    expect(db.rows('waitlist_installers')).toHaveLength(0)
  })

  it('"Other" needs a reason in words', async () => {
    const r = await deleteWaitlistEntry({ table: 'consumers', id: LEAD, reason: 'other' })
    expect(r).toMatchObject({ ok: false, field: 'note' })
    const ok = await deleteWaitlistEntry({
      table: 'consumers',
      id: LEAD,
      reason: 'other',
      note: 'Asked to be removed',
    })
    expect(ok.ok).toBe(true)
    expect(db.rows('audit_log')[0]!.after).toEqual({ reason: 'other', note: 'Asked to be removed' })
  })

  it('an entry already gone says so', async () => {
    await deleteWaitlistEntry({ table: 'consumers', id: LEAD, reason: 'test' })
    const again = await deleteWaitlistEntry({ table: 'consumers', id: LEAD, reason: 'test' })
    expect(again).toMatchObject({ ok: false, error: 'This entry was already deleted.' })
  })
})

describe('deleteAllTestEntries', () => {
  it('deletes only is_test entries, with one audit row listing every id', async () => {
    const installerId = db.rows('waitlist_installers')[0]!.id
    const r = await deleteAllTestEntries({ expected: 2 })
    expect(r).toEqual({ ok: true, deleted: 2 })
    expect(db.rows('waitlist_consumers').map((x) => x.first_name)).toEqual(['Real'])
    expect(db.rows('waitlist_installers')).toHaveLength(0)
    const entries = db.rows('audit_log')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      action: 'waitlist.delete_test',
      before: { count: 2, consumers: [LEAD], installers: [installerId] },
    })
  })

  it('refuses when the count shown is out of date', async () => {
    const r = await deleteAllTestEntries({ expected: 5 })
    expect(r).toMatchObject({ ok: false })
    expect(db.rows('waitlist_consumers')).toHaveLength(2)
  })

  it('staff without the permission cannot', async () => {
    session = staff('content')
    expect((await deleteAllTestEntries({ expected: 2 })).ok).toBe(false)
    expect(db.rows('waitlist_installers')).toHaveLength(1)
  })
})
