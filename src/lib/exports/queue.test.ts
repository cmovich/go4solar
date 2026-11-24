import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
// The level each person could go as (Full / Basic) is worked out from their profile; here the
// profile loader is not needed: every person counts as Basic.
vi.mock('@/lib/tradeLenda/server', () => ({
  loadProfileView: async () => null,
  basisFor: async () => null,
}))

const { addToQueue, openQueue, removeFromQueue } = await import('./queue')

const ops = { id: 'ops-1', role: 'operations' as const }
const sales = { id: 'sales-1', role: 'sales' as const }
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const T = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  db = fakeSupabase({ export_queue_items: [['queue_id', 'waitlist_id']] })
  let n = 0
  db.defineFunction(
    'next_export_number',
    (a) => `${a.p_test ? 'EXPT' : 'EXP'}-2026-${String(++n).padStart(4, '0')}`,
  )
  db.seed(
    'waitlist_consumers',
    { id: A, is_test: false },
    { id: B, is_test: false },
    { id: T, is_test: true },
  )
})

describe('export queue', () => {
  it('Sales cannot queue (only super admin and Operations)', async () => {
    expect((await addToQueue([A], sales)).ok).toBe(false)
    expect(db.rows('export_queues')).toHaveLength(0)
  })

  it('the first add opens EXP-…; later adds (from either tab) go into the same open queue', async () => {
    expect(await addToQueue([A], ops)).toEqual({ ok: true, number: 'EXP-2026-0001', added: 1 })
    expect(await addToQueue([B, A], ops)).toEqual({ ok: true, number: 'EXP-2026-0001', added: 1 })
    expect(db.rows('export_queues')).toHaveLength(1)
    expect(
      db
        .rows('export_queue_items')
        .map((i) => i.waitlist_id)
        .sort(),
    ).toEqual([A, B])
    expect(db.rows('audit_log').map((a) => a.action)).toEqual([
      'export_queue.add',
      'export_queue.add',
    ])
  })

  it('test and real entries never share a queue; test queues have their own numbers', async () => {
    expect((await addToQueue([A, T], ops)).ok).toBe(false)
    expect(await addToQueue([T], ops)).toMatchObject({ ok: true, number: 'EXPT-2026-0001' })
    expect(await openQueue(false)).toBeNull()
  })

  it('remove a person from the open queue (audited)', async () => {
    await addToQueue([A, B], ops)
    const q = await openQueue(false)
    expect(await removeFromQueue({ queueId: q!.id, waitlistId: A }, ops)).toEqual({ ok: true })
    expect(db.rows('export_queue_items').map((i) => i.waitlist_id)).toEqual([B])
  })
})
