import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { SEEDED_PLANS } from '@/lib/readyPlans/plans.fixture'
import { planToRow } from '@/lib/readyPlans/schema'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
let session: SessionInfo = { user: null, role: null, aal: null }
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: async () => session }))
let removed: string[][] = []
let removeFails = false
const storage = {
  from: () => ({
    remove: async (paths: string[]) => {
      removed.push(paths)
      return removeFails
        ? { data: null, error: { message: 'storage down' } }
        : { data: [], error: null }
    },
  }),
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ ...db.client, storage }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { confirmReadyPlan, moveReadyPlan, saveReadyPlan, setReadyPlanActive } =
  await import('./actions')

const sa: SessionInfo = { user: { id: 'sa', email: 's@x.test' }, role: 'super_admin', aal: 'aal2' }
const fin: SessionInfo = { user: { id: 'f', email: 'f@x.test' }, role: 'finance', aal: 'aal2' }
const [one, two] = SEEDED_PLANS as [(typeof SEEDED_PLANS)[0], (typeof SEEDED_PLANS)[0]]

beforeEach(() => {
  db = fakeSupabase({ ready_plans: [['slug']] })
  session = sa
  removed = []
  removeFails = false
})

describe('ready-made plan actions (Admin → Pricing → Ready-made plans)', () => {
  it('super admin with two-factor only; nothing written otherwise', async () => {
    for (const s of [fin, { ...sa, aal: 'aal1' as const }]) {
      session = s
      expect(await saveReadyPlan(one)).toMatchObject({ ok: false })
    }
    expect(db.rows('ready_plans')).toEqual([])
    expect(db.rows('audit_log')).toEqual([])
  })

  it('a new plan is saved as SAMPLE, with an audit row', async () => {
    const r = await saveReadyPlan({ ...one, sample: false })
    expect(r).toMatchObject({ ok: true })
    expect(db.rows('ready_plans')[0]).toMatchObject({ slug: one.slug, sample: true })
    expect(db.rows('audit_log')[0]).toMatchObject({
      action: 'ready_plan.create',
      entity: 'ready_plans',
      actor_id: 'sa',
    })
  })

  it('editing keeps the SAMPLE flag as it is; "Confirm prices" clears it (audited)', async () => {
    db.seed('ready_plans', { ...planToRow(one), id: 'p1', sample: true })
    expect(await saveReadyPlan({ ...one, id: 'p1', name: 'Neighbour', sample: false })).toEqual({
      ok: true,
      id: 'p1',
    })
    expect(db.rows('ready_plans')[0]).toMatchObject({ name: 'Neighbour', sample: true })
    expect(await confirmReadyPlan({ id: 'p1' })).toEqual({ ok: true })
    expect(db.rows('ready_plans')[0]).toMatchObject({ sample: false })
    expect(db.rows('audit_log').map((a) => a.action)).toEqual([
      'ready_plan.update',
      'ready_plan.confirm',
    ])
  })

  it('refuses a plan with problems, in plain words', async () => {
    expect(await saveReadyPlan({ ...one, tenures: [6, 9] })).toEqual({
      ok: false,
      error: 'Offer 12 months: the pay-in-full price is worked out from it.',
    })
    expect(await saveReadyPlan({ ...one, slug: 'Bad Slug' })).toMatchObject({ ok: false })
    expect(db.rows('ready_plans')).toEqual([])
  })

  it('switch off and move up/down (order swaps with the neighbour)', async () => {
    db.seed(
      'ready_plans',
      { ...planToRow(one), id: 'p1', sort_order: 1 },
      { ...planToRow(two), id: 'p2', sort_order: 2 },
    )
    expect(await setReadyPlanActive({ id: 'p1', active: false })).toEqual({ ok: true })
    expect(db.rows('ready_plans')[0]).toMatchObject({ active: false })
    expect(await moveReadyPlan({ id: 'p2', direction: 'up' })).toEqual({ ok: true })
    const order = Object.fromEntries(db.rows('ready_plans').map((r) => [r.id, r.sort_order]))
    expect(order).toEqual({ p1: 2, p2: 1 })
    expect(db.rows('audit_log').map((a) => a.action)).toEqual([
      'ready_plan.switch_off',
      'ready_plan.move',
    ])
  })
})

describe('plan pictures (upload/replace in the editor)', () => {
  const old = 'plan/i-pass-my-neighbour-60ac8de7.webp'
  const next = 'plan/1f0e2c3a-aaaa-bbbb-cccc-0123456789ab.webp'
  beforeEach(() => db.seed('ready_plans', { ...planToRow(one), id: 'p1', image: old }))

  it('a new picture is saved (audited) and the old file is removed from storage', async () => {
    expect(await saveReadyPlan({ ...one, id: 'p1', image: next })).toEqual({ ok: true, id: 'p1' })
    expect(db.rows('ready_plans')[0]).toMatchObject({ image: next })
    expect(removed).toEqual([[old]])
    expect(db.rows('audit_log').map((a) => a.action)).toEqual([
      'ready_plan.update',
      'site_media.delete',
    ])
    expect(db.rows('audit_log')[0]).toMatchObject({
      before: expect.objectContaining({ image: old }),
      after: expect.objectContaining({ image: next }),
    })
  })
  it('the same picture: nothing removed', async () => {
    await saveReadyPlan({ ...one, id: 'p1', image: old })
    expect(removed).toEqual([])
  })
  it('if storage fails the save still stands (the old file is only logged)', async () => {
    removeFails = true
    expect(await saveReadyPlan({ ...one, id: 'p1', image: next })).toEqual({ ok: true, id: 'p1' })
    expect(db.rows('ready_plans')[0]).toMatchObject({ image: next })
  })
})
