import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
let failInsert = false
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () =>
    failInsert
      ? {
          from: () => {
            throw new Error('network down')
          },
        }
      : db.client,
}))

const { getMessagingProvider } = await import('./index')

const msg = {
  channel: 'sms' as const,
  to: '+2348000001234',
  template: 't',
  payload: { text: 'hi' },
}

beforeEach(() => {
  db = fakeSupabase()
  failInsert = false
  vi.unstubAllEnvs()
})

// Prompt 16A: production has no SMS/email keys yet. A message attempt must never throw.
describe('messaging in production without a live provider', () => {
  it('records the message in the outbox as not_sent (no mock in production)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('MESSAGING_PROVIDER', '')
    const p = await getMessagingProvider()
    expect(p.name).toBe('unsent')
    expect(await p.send(msg)).toMatchObject({ status: 'not_sent' })
    expect(db.rows('outbox')[0]).toMatchObject({ to: '+2348000001234', status: 'not_sent' })
  })

  it('never throws, even when the outbox cannot be written', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    failInsert = true
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = await getMessagingProvider()
    await expect(p.send(msg)).resolves.toMatchObject({ status: 'failed' })
    log.mockRestore()
  })

  it('previews and local runs keep the mock (outbox, queued)', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await getMessagingProvider()).name).toBe('mock')
  })
})
