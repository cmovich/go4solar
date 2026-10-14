import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

import { extensionProblem } from './lock'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const sent: { template: string; payload: { text: string } }[] = []
vi.mock('@/lib/providers/messaging', () => ({
  getMessagingProvider: async () => ({
    send: async (m: { template: string; payload: { text: string } }) => (
      sent.push(m),
      { id: 'm', status: 'queued' }
    ),
  }),
}))

const { approveExtension } = await import('./extension')

const today = '2026-10-14'
const boss = { id: 'boss-1', role: 'super_admin' as const }

beforeEach(() => {
  sent.length = 0
  db = fakeSupabase()
  db.seed('applications', {
    id: 'app-1',
    personal: { firstName: 'Ada', phone: '+2348000001234', email: 'ada@example.org' },
  })
  db.seed('loans', {
    id: 'loan-1',
    application_id: 'app-1',
    status: 'active',
    extension_until: null,
  })
})

describe('extensionProblem (one extension of up to 30 days, agreement clause 6)', () => {
  const ok = { today, alreadyGranted: false, active: true }
  it('accepts a date from tomorrow up to 30 days ahead', () => {
    expect(extensionProblem({ ...ok, until: '2026-10-15' })).toBeNull()
    expect(extensionProblem({ ...ok, until: '2026-11-13' })).toBeNull()
  })
  it('refuses today or earlier, more than 30 days, a second extension, or an inactive plan', () => {
    expect(extensionProblem({ ...ok, until: today })).toMatch(/after today/)
    expect(extensionProblem({ ...ok, until: '2026-11-14' })).toMatch(/30 days/)
    expect(extensionProblem({ ...ok, until: '2026-10-20', alreadyGranted: true })).toMatch(/one/)
    expect(extensionProblem({ ...ok, until: '2026-10-20', active: false })).toMatch(/active/)
  })
})

describe('approveExtension', () => {
  it('records the extension, writes audit_log and tells the customer', async () => {
    const r = await approveExtension({ loanId: 'loan-1', until: '2026-10-30', actor: boss, today })
    expect(r).toEqual({ ok: true })
    expect(db.rows('loans')[0]).toMatchObject({
      extension_until: '2026-10-30',
      extension_approved_by: 'boss-1',
    })
    expect(db.rows('audit_log')[0]).toMatchObject({
      actor_id: 'boss-1',
      action: 'loan.extension.approve',
      entity: 'loans',
      entity_id: 'loan-1',
      after: { extension_until: '2026-10-30' },
    })
    expect(sent.map((m) => m.template)).toContain('extension_approved')
  })

  it('only one extension per plan', async () => {
    await approveExtension({ loanId: 'loan-1', until: '2026-10-30', actor: boss, today })
    const again = await approveExtension({
      loanId: 'loan-1',
      until: '2026-11-05',
      actor: boss,
      today,
    })
    expect(again.ok).toBe(false)
    expect(db.rows('loans')[0]!.extension_until).toBe('2026-10-30')
  })

  it('finance and operations staff cannot approve', async () => {
    const r = await approveExtension({
      loanId: 'loan-1',
      until: '2026-10-30',
      actor: { id: 'f-1', role: 'finance' },
      today,
    })
    expect(r.ok).toBe(false)
    expect(db.rows('audit_log')).toEqual([])
  })
})
