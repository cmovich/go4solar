import { randomUUID } from 'node:crypto'

import { config } from 'dotenv'
import { afterAll, describe, expect, it } from 'vitest'

import { hitRateLimit } from './hitRateLimit'

// Integration test against the real `hit_rate_limit` SQL function. Needs .env.local
// (Supabase URL + service role key); skipped where they are absent (e.g. Vercel CI).
config({ path: '.env.local' })
const hasDb = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

describe.skipIf(!hasDb)('hit_rate_limit (database)', () => {
  const key = `test:${randomUUID()}`

  afterAll(async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    await createAdminClient().from('rate_limits').delete().eq('key', key)
  })

  it('allows 10 hits in an hour and refuses the 11th', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 11; i++) {
      results.push(await hitRateLimit(key, 10, '1 hour'))
    }
    expect(results.slice(0, 10).every(Boolean)).toBe(true)
    expect(results[10]).toBe(false)
  }, 90_000)

  it('keys are independent', async () => {
    expect(await hitRateLimit(`${key}:other`, 1, '1 hour')).toBe(true)
    expect(await hitRateLimit(`${key}:other`, 1, '1 hour')).toBe(false)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    await createAdminClient().from('rate_limits').delete().eq('key', `${key}:other`)
  }, 90_000)
})
