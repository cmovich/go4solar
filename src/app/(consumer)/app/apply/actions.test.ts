import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { idHash } from '@/lib/ids/idHash'

const ID_SECRET = 'local-test-only-id-hash-0123456789abcdef'
process.env.ID_HASH_SECRET = ID_SECRET

const getSessionInfo = vi.fn<() => Promise<SessionInfo>>()
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: () => getSessionInfo() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({ hitRateLimit: async () => true }))
vi.mock('@/lib/applications/server', () => ({
  checkSummaries: async () => [],
  documentKinds: async () => ['nin_front'],
}))
const verifyNin = vi.fn(async () => ({
  status: 'passed' as const,
  nameMatch: true,
  dobMatch: true,
}))
const verifyBvn = vi.fn(async () => ({
  status: 'passed' as const,
  nameMatch: true,
  dobMatch: true,
}))
vi.mock('@/lib/providers/kyc', () => ({
  getKycProvider: async () => ({ name: 'mock', verifyNin, verifyBvn }),
}))

const app = {
  id: 'app-1',
  consumer_id: 'u-1',
  status: 'draft',
  steps: { details: true },
  personal: { firstName: 'Ada', surname: 'Obi', dob: '1990-01-01' },
}
let duplicates = 0
let updateError: { code: string; message: string } | null = null
const updates: Record<string, unknown>[] = []

/** A chainable stand-in for the Supabase query builder. */
function query(table: string) {
  let op = 'select'
  let body: Record<string, unknown> | null = null
  const q = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    order: () => q,
    limit: () => q,
    insert: async () => ({ error: null }),
    update: (b: Record<string, unknown>) => {
      op = 'update'
      body = b
      return q
    },
    maybeSingle: async () => ({ data: app }),
    then: (resolve: (v: unknown) => void) => {
      if (op === 'update') {
        if (!updateError) updates.push(body!)
        return resolve({ error: updateError })
      }
      return resolve({ count: table === 'applications' ? duplicates : 0, data: null })
    },
  }
  return q
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => query(t) }),
}))

const actions = await import('./actions')
const NIN = '12345678901'

beforeEach(() => {
  vi.clearAllMocks()
  duplicates = 0
  updateError = null
  updates.length = 0
  getSessionInfo.mockResolvedValue({
    user: { id: 'u-1', email: 'a@x.test' },
    role: 'consumer',
    aal: 'aal1',
  })
})

describe('NIN step: keyed hash and one active application per NIN', () => {
  it('stores the keyed hash of the full NIN and only the last 4 digits', async () => {
    expect(await actions.verifyNin({ nin: NIN })).toEqual({ ok: true, status: 'passed' })
    const saved = updates.at(-1)!
    expect(saved.nin_hash).toBe(idHash('nin', NIN, ID_SECRET))
    expect(JSON.stringify(saved)).not.toContain(NIN)
    expect(JSON.stringify(saved)).toContain('"ninLast4":"8901"')
  })

  it('blocks a second active application with the same NIN, before the paid lookup', async () => {
    duplicates = 1
    const r = await actions.verifyNin({ nin: NIN })
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already an application with this NIN/),
    })
    expect(verifyNin).not.toHaveBeenCalled()
  })

  it('a race caught by the database unique index gives the same message', async () => {
    updateError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const r = await actions.verifyNin({ nin: NIN })
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already an application with this NIN/),
    })
  })

  it('stores the keyed hash of the full BVN', async () => {
    expect(await actions.verifyBvn({ bvn: '22222222222' })).toEqual({ ok: true, status: 'passed' })
    expect(updates.at(-1)!.bvn_hash).toBe(idHash('bvn', '22222222222', ID_SECRET))
  })
})
