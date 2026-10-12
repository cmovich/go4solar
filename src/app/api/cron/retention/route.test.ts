import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

// In-memory database only: this test never touches the real project.
let db = fakeSupabase()
const removed: string[][] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    ...db.client,
    storage: {
      from: () => ({ remove: async (paths: string[]) => (removed.push(paths), { error: null }) }),
    },
  }),
}))

process.env.CRON_SECRET = 'cron-secret-for-tests'
const { GET } = await import('./route')

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const call = (qs = '', auth = 'Bearer cron-secret-for-tests') =>
  GET(new Request(`http://localhost/api/cron/retention${qs}`, { headers: { authorization: auth } }))

beforeEach(() => {
  removed.length = 0
  db = fakeSupabase()
  db.seed('applications', { id: 'A', status: 'draft' }, { id: 'B', status: 'approved' })
  db.seed(
    'kyc_checks',
    { subject_id: 'A', kind: 'nin', status: 'failed', created_at: days(40) },
    { subject_id: 'B', kind: 'nin', status: 'failed', created_at: days(40) },
  )
  db.seed(
    'documents',
    { id: 'dA', application_id: 'A', kind: 'nin_front', storage_path: 'u/A/nin.jpg' },
    { id: 'dB', application_id: 'B', kind: 'nin_front', storage_path: 'u/B/nin.jpg' },
  )
  db.seed('waitlist_consumers', { id: 'w1', cleared_at: days(10) }, { id: 'w2', cleared_at: null })
  db.seed('waitlist_installers', { id: 'i1', cleared_at: days(2) })
})

describe('GET /api/cron/retention', () => {
  it('refuses without the cron secret', async () => {
    expect((await call('', 'Bearer nope')).status).toBe(401)
    expect(db.rows('audit_log')).toHaveLength(0)
  })

  it('dry run: counts only, deletes nothing, writes one audit row with the counts', async () => {
    const r = await call('?dry=1')
    expect(await r.json()).toEqual({
      kycImages: 1,
      waitlistConsumers: 1,
      waitlistInstallers: 0,
      dryRun: true,
    })
    expect(db.rows('documents')).toHaveLength(2)
    expect(db.rows('waitlist_consumers')).toHaveLength(2)
    expect(removed).toEqual([])
    expect(db.rows('audit_log')).toEqual([
      expect.objectContaining({
        action: 'retention.dry_run',
        after: expect.objectContaining({ kycImages: 1, waitlistConsumers: 1 }),
      }),
    ])
  })

  it('real run: deletes exactly what the rules pick and records the counts', async () => {
    expect((await call()).status).toBe(200)
    expect(db.rows('documents').map((d) => d.id)).toEqual(['dB'])
    expect(removed).toEqual([['u/A/nin.jpg']])
    expect(db.rows('waitlist_consumers').map((w) => w.id)).toEqual(['w2'])
    expect(db.rows('waitlist_installers').map((w) => w.id)).toEqual(['i1'])
    expect(db.rows('audit_log')[0]).toMatchObject({ action: 'retention.run' })
  })
})
