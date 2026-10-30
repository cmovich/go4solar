import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

// A newer chosen quote never borrows an older application (Semako, 30 Oct).
let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))

const { ensureApplication, waitingQuote } = await import('./server')

const USER = 'user-1'
const OLD_Q = '11111111-1111-4111-8111-111111111111'
const NEW_Q = '22222222-2222-4222-8222-222222222222'
const at = (min: number) => new Date(Date.UTC(2026, 9, 30, 10, min)).toISOString()

function seed(status: string) {
  db.seed('quotes', {
    id: OLD_Q,
    owner_id: USER,
    status: 'chosen',
    updated_at: at(0),
    state: 'Lagos',
  })
  db.seed('applications', {
    id: 'app-1',
    consumer_id: USER,
    quote_id: OLD_Q,
    status,
    applicant_type: 'individual',
    personal: { firstName: 'Moses' },
    guarantor: { name: 'Ada Guarantor' },
    steps: { nin: true, guarantor: true },
    created_at: at(1),
  })
  db.seed('guarantees', { id: 'g-1', application_id: 'app-1', status: 'invited' })
  db.seed('quotes', {
    id: NEW_Q,
    owner_id: USER,
    status: 'chosen',
    updated_at: at(5),
    state: 'FCT',
  })
}

beforeEach(() => {
  db = fakeSupabase()
})

describe('ensureApplication with a newer chosen quote', () => {
  it('an unsigned draft moves to the new quote; the guarantor is asked again and old links stop', async () => {
    seed('draft')
    const app = await ensureApplication(USER)
    expect(app).toMatchObject({ id: 'app-1', quote_id: NEW_Q, guarantor: null })
    expect((app!.steps as Record<string, boolean>).guarantor).toBe(false)
    expect((app!.steps as Record<string, boolean>).nin).toBe(true) // same person: ID checks stay
    expect(db.rows('guarantees')[0]!.status).toBe('expired')
    expect(await waitingQuote(USER)).toBeNull()
  })

  it('a draft the customer already signed stays on its own quote; the new one waits', async () => {
    seed('draft')
    db.seed('agreements', { application_id: 'app-1', type: 'consumer' })
    const app = await ensureApplication(USER)
    expect(app).toMatchObject({ id: 'app-1', quote_id: OLD_Q })
    expect(db.rows('guarantees')[0]!.status).toBe('invited')
    expect(await waitingQuote(USER)).toMatch(/^G4S-/)
  })

  it('a submitted application is never touched', async () => {
    seed('submitted')
    const app = await ensureApplication(USER)
    expect(app).toMatchObject({
      id: 'app-1',
      quote_id: OLD_Q,
      guarantor: { name: 'Ada Guarantor' },
    })
  })

  it('after a decline the new quote gets its own new application (no old guarantor copied)', async () => {
    seed('declined')
    const app = await ensureApplication(USER)
    expect(app!.id).not.toBe('app-1')
    expect(app).toMatchObject({ quote_id: NEW_Q, consumer_id: USER })
    expect(app!.guarantor ?? null).toBeNull()
    expect(db.rows('applications')).toHaveLength(2)
  })
})
