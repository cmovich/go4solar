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

type Call = { table: string; op: string; payload?: unknown; options?: unknown }
const calls: Call[] = []
/** When set, the next upsert fails with this database error. */
let upsertError: { code: string; message: string; details: string | null } | null = null
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
      upsert: (payload: unknown, options?: unknown) => {
        calls.push({ table, op: 'upsert', payload, options })
        const error = upsertError
        upsertError = null
        return error ? { ...builder, then: (r: (v: unknown) => void) => r({ error }) } : builder
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

const { saveComponents, saveMargins, saveLateFee, saveRates } = await import('./actions')

const superAdmin: SessionInfo = {
  user: { id: 'u-sa', email: 'sa@example.org' },
  role: 'super_admin',
  aal: 'aal2',
}
const creditOfficer: SessionInfo = {
  ...superAdmin,
  user: { id: 'u-co', email: 'co@example.org' },
  role: 'credit_officer',
}

beforeEach(() => {
  calls.length = 0
  upsertError = null
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

  // Fix-up 1 #7: the remote-lock days are an admin setting, saved with an audit row.
  it('saves lock_after_days_overdue with the late fee, with an audit_log row', async () => {
    getSessionInfo.mockResolvedValue(superAdmin)
    const r = await saveLateFee({ dailyRate: 0.0075, capShare: 0.25, lockAfterDays: 10 })
    expect(r.ok).toBe(true)
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: 'settings',
        op: 'upsert',
        payload: expect.objectContaining({ key: 'lock_after_days_overdue', value: 10 }),
      }),
    )
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: 'audit_log',
        op: 'insert',
        payload: expect.objectContaining({
          action: 'pricing.lock_rule.update',
          entity: 'settings.lock_after_days_overdue',
          after: 10,
        }),
      }),
    )
  })

  it('refuses lock days outside 1–90 and non-super-admins', async () => {
    getSessionInfo.mockResolvedValue(superAdmin)
    expect((await saveLateFee({ dailyRate: 0.0075, capShare: 0.25, lockAfterDays: 0 })).ok).toBe(
      false,
    )
    getSessionInfo.mockResolvedValue(creditOfficer)
    expect((await saveLateFee({ dailyRate: 0.0075, capShare: 0.25, lockAfterDays: 7 })).ok).toBe(
      false,
    )
    expect(calls).toEqual([])
  })
})

// Bug (17 Oct): adding a component failed with "null value in column id"; Save is all-or-nothing.
describe('saveComponents', () => {
  const EXISTING = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
  const existing = {
    id: EXISTING,
    sku: 'PNL-500',
    name: '500 W solar panel',
    category: 'panels',
    unitCost: 110000,
    size: 500,
    source: 'oem',
    active: true,
    sample: false,
  }
  const added = {
    ...existing,
    id: undefined,
    sku: 'PNL-550',
    name: '550 W solar panel',
    unitCost: 120000,
    size: 550,
  }

  beforeEach(() => getSessionInfo.mockResolvedValue(superAdmin))

  const upserts = () => calls.filter((c) => c.table === 'components' && c.op === 'upsert')
  const audits = () => calls.filter((c) => c.table === 'audit_log')

  it('a new component gets its id from the database (missing fields use the column default)', async () => {
    expect(await saveComponents([existing, added])).toEqual({ ok: true })
    const [u] = upserts()
    expect(u?.options).toEqual({ onConflict: 'id', defaultToNull: false })
    const rows = u?.payload as Record<string, unknown>[]
    expect(rows[1]).not.toHaveProperty('id')
    expect(rows[1]).toMatchObject({
      sku: 'PNL-550',
      unit_cost: 120000,
      stock_sizes: { watts: 550 },
    })
  })

  it('editing an existing component keeps its id, and the change goes to the audit log', async () => {
    expect(await saveComponents([{ ...existing, unitCost: 115000 }])).toEqual({ ok: true })
    const rows = upserts()[0]?.payload as Record<string, unknown>[]
    expect(rows[0]).toMatchObject({ id: EXISTING, sku: 'PNL-500', unit_cost: 115000 })
    expect(audits()[0]?.payload).toMatchObject({
      action: 'pricing.components.update',
      entity: 'components',
      after: [expect.objectContaining({ sku: 'PNL-500', unit_cost: 115000 })],
    })
  })

  it('the same SKU twice: a clear message, nothing sent to the database', async () => {
    const r = await saveComponents([existing, { ...added, sku: 'pnl-500' }])
    expect(r).toEqual({
      ok: false,
      error: 'PNL-500 already exists (rows 1 and 2). Use a different SKU. Nothing was saved.',
      field: 'sku',
    })
    expect(calls).toEqual([])
  })

  it('a SKU the database already has: a clear message, no audit row', async () => {
    upsertError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "components_sku_key"',
      details: 'Key (sku)=(PNL-550) already exists.',
    }
    expect(await saveComponents([existing, added])).toEqual({
      ok: false,
      error: 'PNL-550 already exists (row 2). Use a different SKU. Nothing was saved.',
    })
    expect(audits()).toEqual([])
  })

  it('one bad row: the row is named and nothing is written', async () => {
    const r = await saveComponents([existing, { ...added, size: 0 }])
    expect(r).toMatchObject({
      ok: false,
      error: 'Row 2 (PNL-550), size: Enter the size. Nothing was saved.',
    })
    expect(calls).toEqual([])
  })

  it('the database refuses the save: one message, no audit row (one request = all or nothing)', async () => {
    upsertError = { code: 'XX000', message: 'boom', details: null }
    expect(await saveComponents([existing, added])).toEqual({
      ok: false,
      error: 'The components could not be saved, so nothing was changed. Please try again.',
    })
    expect(upserts()).toHaveLength(1)
    expect(audits()).toEqual([])
  })
})

// Longer payment plans: every tenure has an on/off switch and its own rate (audited).
describe('saveRates', () => {
  const row = (t: number, over: object = {}) => ({
    tenureMonths: t,
    enabled: t <= 12,
    expectedFunderRate: t <= 12 ? 0.16 : null,
    spread: t <= 12 ? 0.06 : null,
    defaultBuffer: t <= 12 ? 0.02 : null,
    ...over,
  })
  const all = (over: Record<number, object> = {}) =>
    [3, 6, 9, 12, 18, 24].map((t) => row(t, over[t]))

  beforeEach(() => getSessionInfo.mockResolvedValue(superAdmin))

  it('saves all six tenures with their switch; 18 and 24 can stay off with no rate', async () => {
    expect(await saveRates(all())).toEqual({ ok: true })
    const up = calls.find((c) => c.table === 'pricing_rates' && c.op === 'upsert')
    const rows = up?.payload as Record<string, unknown>[]
    expect(rows).toHaveLength(6)
    expect(rows[4]).toEqual({
      tenure_months: 18,
      enabled: false,
      expected_funder_rate: null,
      spread: null,
      default_buffer: null,
      sample: false,
    })
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: 'audit_log',
        payload: expect.objectContaining({ action: 'pricing.rates.update' }),
      }),
    )
  })

  it('switching 24 months on without a rate is refused in plain words; nothing written', async () => {
    const r = await saveRates(all({ 24: { enabled: true } }))
    expect(r).toMatchObject({
      ok: false,
      error: '24 months: enter the funder rate, spread and buffer before switching it on.',
    })
    expect(calls.filter((c) => c.op !== 'select')).toEqual([])
  })

  it('a rate too high for 24 months is refused', async () => {
    const r = await saveRates(
      all({ 24: { enabled: true, expectedFunderRate: 0.3, spread: 0.15, defaultBuffer: 0.05 } }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^24 months: a 50% yearly rate is too high/)
  })

  it('12 months cannot be switched off', async () => {
    const r = await saveRates(all({ 12: { enabled: false } }))
    expect(r).toMatchObject({
      ok: false,
      error: '12 months must stay switched on: estimates are priced at 12 months.',
    })
  })
})
