import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))

const { restoreFunderBalance } = await import('./balance')

const TL = 'f0000000-0000-4000-8000-000000000001'
let balance = 0

beforeEach(() => {
  db = fakeSupabase()
  balance = 5_000_000
  db.defineFunction('draw_from_funder', (a) => {
    balance -= Number(a.p_amount)
    return balance
  })
})

describe('restoreFunderBalance (an approved Trade Lenda loan is cancelled)', () => {
  it('gives back the customer’s amount financed, once, audited', async () => {
    db.seed('loans', {
      application_id: 'app1',
      funder_id: TL,
      drawn: 1_045_600,
      lending_type: 'customer',
    })
    await restoreFunderBalance('app1', null)
    await restoreFunderBalance('app1', null)
    expect(balance).toBe(5_000_000 + 1_045_600)
    expect(db.rows('loans')[0]!.drawn).toBe(0)
    expect(db.rows('audit_log').filter((r) => r.action === 'funder.balance_restore')).toHaveLength(
      1,
    )
  })

  it('other funders (no lending type) are not touched', async () => {
    db.seed('loans', { application_id: 'app2', funder_id: TL, drawn: 841_100, lending_type: null })
    await restoreFunderBalance('app2', null)
    expect(balance).toBe(5_000_000)
  })
})
