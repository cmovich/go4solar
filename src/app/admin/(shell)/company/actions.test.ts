import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { DEFAULT_COMPANY } from '@/lib/company/schema'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
let session: SessionInfo = { user: null, role: null, aal: null }
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: async () => session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db.client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { saveCompany } = await import('./actions')

const form = { ...DEFAULT_COMPANY, rcNumber: 'RC 99', quoteValidityDays: 10 }

beforeEach(() => {
  db = fakeSupabase()
  db.seed('settings', { key: 'company', value: DEFAULT_COMPANY })
  db.seed('settings', { key: 'quote_validity_days', value: 7 })
})

describe('saveCompany (admin "Company details")', () => {
  it('only a super admin with two-factor may save; nothing written otherwise', async () => {
    session = { user: { id: 'ops', email: 'o@x.test' }, role: 'operations', aal: 'aal2' }
    expect(await saveCompany(form)).toMatchObject({ ok: false })
    session = { user: { id: 'sa', email: 's@x.test' }, role: 'super_admin', aal: 'aal1' }
    expect(await saveCompany(form)).toMatchObject({ ok: false })
    expect(db.rows('audit_log')).toEqual([])
  })

  it('saves the details and the validity days, with an audit row (before → after)', async () => {
    session = { user: { id: 'sa', email: 's@x.test' }, role: 'super_admin', aal: 'aal2' }
    expect(await saveCompany(form)).toEqual({ ok: true })
    const settings = Object.fromEntries(db.rows('settings').map((r) => [r.key, r.value]))
    expect(settings.company).toMatchObject({ name: 'Go4Solar Energy Limited', rcNumber: 'RC 99' })
    expect(settings.quote_validity_days).toBe(10)
    const [audit] = db.rows('audit_log')
    expect(audit).toMatchObject({ action: 'company.update', entity: 'settings.company' })
    expect(audit!.before).toMatchObject({ quote_validity_days: 7 })
    expect(audit!.after).toMatchObject({ quote_validity_days: 10 })
  })

  it('a bad email is refused', async () => {
    session = { user: { id: 'sa', email: 's@x.test' }, role: 'super_admin', aal: 'aal2' }
    expect(await saveCompany({ ...form, email: 'nope' })).toMatchObject({ ok: false })
  })
})
