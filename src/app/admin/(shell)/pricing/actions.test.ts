import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'

// --- fakes ---------------------------------------------------------------
const getSessionInfo = vi.fn<() => Promise<SessionInfo>>()
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: () => getSessionInfo() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

type Call = { table: string; op: string; payload?: unknown }
const calls: Call[] = []
/** Minimal query-builder fake: records inserts/upserts/updates, answers selects from `data`. */
function fakeClient(data: Record<string, unknown[]>) {
  const from = (table: string) => {
    const rows = data[table] ?? []
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: rows, error: null }),
      insert: (payload: unknown) => {
        calls.push({ table, op: 'insert', payload })
        return {
          ...builder,
          select: () => ({ single: async () => ({ data: { id: 'new' }, error: null }) }),
        }
      },
      upsert: (payload: unknown) => {
        calls.push({ table, op: 'upsert', payload })
        return builder
      },
      update: (payload: unknown) => {
        calls.push({ table, op: 'update', payload })
        return builder
      },
      delete: () => {
        calls.push({ table, op: 'delete' })
        return builder
      },
    }
    return builder
  }
  return { from, rpc: async () => ({ data: true, error: null }) }
}

const staffData: Record<string, unknown[]> = {
  category_margins: [
    { category: 'panels', margin: 0.125, sample: true },
    { category: 'battery', margin: 0.125, sample: true },
    { category: 'inverter', margin: 0.125, sample: true },
    { category: 'accessories', margin: 0.125, sample: true },
  ],
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient(staffData) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient({}) }))

const { saveMargins } = await import('./actions')

const superAdmin: SessionInfo = {
  user: { id: 'u-sa', email: 'sa@go4solar.app' },
  role: 'super_admin',
  aal: 'aal2',
}
const creditOfficer: SessionInfo = {
  ...superAdmin,
  user: { id: 'u-co', email: 'co@go4solar.app' },
  role: 'credit_officer',
}

beforeEach(() => {
  calls.length = 0
  getSessionInfo.mockReset()
})

describe('pricing server actions', () => {
  it('rejects a non-super_admin before touching the database', async () => {
    getSessionInfo.mockResolvedValue(creditOfficer)
    const r = await saveMargins({
      panels: 0.15,
      battery: 0.125,
      inverter: 0.125,
      accessories: 0.125,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/super admin/i)
    expect(calls).toEqual([])
  })

  it('rejects invalid input', async () => {
    getSessionInfo.mockResolvedValue(superAdmin)
    const r = await saveMargins({ panels: -1, battery: 0.1, inverter: 0.1, accessories: 0.1 })
    expect(r.ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('writes the margins and an audit_log row with before/after on a change', async () => {
    getSessionInfo.mockResolvedValue(superAdmin)
    const r = await saveMargins({
      panels: 0.15,
      battery: 0.125,
      inverter: 0.125,
      accessories: 0.125,
    })
    expect(r.ok).toBe(true)

    const upsert = calls.find((c) => c.table === 'category_margins' && c.op === 'upsert')
    expect(upsert).toBeDefined()
    expect(upsert?.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'panels', margin: 0.15, sample: false }),
      ]),
    )

    const audit = calls.find((c) => c.table === 'audit_log' && c.op === 'insert')
    expect(audit).toBeDefined()
    expect(audit?.payload).toMatchObject({
      actor_id: 'u-sa',
      action: 'pricing.margins.update',
      entity: 'category_margins',
      before: { panels: 0.125, battery: 0.125, inverter: 0.125, accessories: 0.125 },
      after: { panels: 0.15, battery: 0.125, inverter: 0.125, accessories: 0.125 },
    })
  })
})
