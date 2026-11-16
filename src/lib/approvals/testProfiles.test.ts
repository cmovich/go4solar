import { describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

const db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const { testProfileIds } = await import('./admin')

describe('testProfileIds', () => {
  it('finds every test account, past the 1,000-row page limit', async () => {
    for (let i = 0; i < 2500; i++) db.seed('profiles', { id: `t-${i}`, is_test: true })
    db.seed('profiles', { id: 'real', is_test: false })
    const ids = await testProfileIds()
    expect(ids.size).toBe(2500)
    expect(ids.has('t-2499')).toBe(true)
    expect(ids.has('real')).toBe(false)
  })
})
