import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const { voidBatch } = await import('./voidServer')

const admin = { id: 'sa-1', role: 'super_admin' as const }
const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'
const TL = 'tl'

beforeEach(() => {
  db = fakeSupabase()
  db.seed(
    'funder_batches',
    { id: B1, funder_id: TL, number: 'TL-Batch-001', version: 1, voided_at: null, replaced_by: B2 },
    {
      id: B2,
      funder_id: TL,
      number: 'TL-Batch-001',
      version: 2,
      voided_at: null,
      replaced_by: null,
    },
  )
})

describe('voidBatch', () => {
  it('renames every version to TL-VOID-001, keeps the old number and reason, audited', async () => {
    const r = await voidBatch({ batchId: B2, reason: 'exported by mistake from preview' }, admin)
    expect(r).toEqual({ ok: true, voidNumber: 'TL-VOID-001' })
    for (const b of db.rows('funder_batches')) {
      expect(b).toMatchObject({
        number: 'TL-VOID-001',
        voided_number: 'TL-Batch-001',
        voided_by: 'sa-1',
        void_reason: 'exported by mistake from preview',
      })
      expect(b.voided_at).toBeTruthy()
    }
    expect(db.rows('audit_log').map((a) => a.action)).toEqual(['funder_batch.void'])
    // Nothing deleted.
    expect(db.rows('funder_batches')).toHaveLength(2)
  })
  it('only a super admin; a reason is required; never twice', async () => {
    expect(
      (await voidBatch({ batchId: B1, reason: 'x mistake' }, { id: 'o', role: 'operations' })).ok,
    ).toBe(false)
    expect((await voidBatch({ batchId: B1, reason: '' }, admin)).ok).toBe(false)
    await voidBatch({ batchId: B1, reason: 'mistake' }, admin)
    expect(await voidBatch({ batchId: B1, reason: 'mistake' }, admin)).toEqual({
      ok: false,
      error: 'This batch is already voided.',
    })
  })
})
