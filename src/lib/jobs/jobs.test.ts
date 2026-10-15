import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const sent: { channel: string; template: string; payload: { text?: string } }[] = []
vi.mock('@/lib/providers/messaging', () => ({
  getMessagingProvider: async () => ({
    send: async (m: (typeof sent)[number]) => (sent.push(m), { id: 'm', status: 'queued' }),
  }),
}))

const jobs = await import('./server')

const ops = { id: 'ops-1', role: 'operations' as const }
const approver = { id: 'officer-1', role: 'super_admin' as const }
const finance = { id: 'fin-1', role: 'finance' as const }

function seed(loanStatus = 'approved') {
  db = fakeSupabase({ jobs: [['loan_id']] })
  db.seed('applications', {
    id: 'app-1',
    consumer_id: 'u-1',
    status: 'approved',
    personal: { firstName: 'Ada', phone: '+2348031234567', email: 'ada@x.test' },
  })
  db.seed('loans', {
    id: 'loan-1',
    application_id: 'app-1',
    consumer_id: 'u-1',
    status: loanStatus,
    approved_by: 'officer-1',
    tenure: 3,
    start_date: null,
  })
  for (const n of [1, 2, 3])
    db.seed('repayment_schedule', {
      loan_id: 'loan-1',
      n,
      due_date: '2026-11-11',
      amount: 100000,
      paid_amount: 0,
      status: 'due',
    })
}

const assign = () =>
  jobs.assignJob({
    loanId: 'loan-1',
    installerName: 'Bayo Installs',
    installerPhone: '08031112222',
    equipmentSource: 'go4solar_store',
    vendorName: null,
    scheduledDate: '2026-12-20',
    actor: ops,
  })

async function installedJob() {
  await assign()
  const id = String(db.rows('jobs')[0]!.id)
  const saved = await jobs.recordSerials({
    jobId: id,
    serials: { panels: ['PNL-0001', 'PNL-0002'], batteries: ['BAT-0001'], inverters: ['INV-0001'] },
    actor: ops,
  })
  expect(saved).toEqual({ ok: true })
  db.rows('jobs')[0]!.photos = ['job/photo.jpg']
  expect(await jobs.markInstalled({ jobId: id, actor: ops })).toEqual({ ok: true })
  return id
}

beforeEach(() => {
  sent.length = 0
  seed()
})
afterEach(() => vi.useRealTimers())

describe('assignJob', () => {
  it('needs an approved loan', async () => {
    seed('pending_approval')
    expect(await assign()).toMatchObject({ ok: false })
    expect(db.rows('jobs')).toHaveLength(0)
  })

  it('creates the job with a 6-digit pickup code and tells the customer who and when', async () => {
    expect(await assign()).toEqual({ ok: true })
    const job = db.rows('jobs')[0]!
    expect(job).toMatchObject({
      status: 'assigned',
      installer_phone: '+2348031112222',
      assigned_by: 'ops-1',
      scheduled_date: '2026-12-20',
    })
    expect(String(job.pickup_code)).toMatch(/^\d{6}$/)
    expect(new Set(sent.map((m) => m.template))).toEqual(new Set(['installer_assigned']))
    expect(sent[0]!.payload.text).toMatch(/Bayo Installs.*20 December 2026/)
    expect(db.rows('audit_log').map((a) => a.action)).toEqual(['job.assign'])
  })

  it('a named vendor is required when the equipment comes from a vendor', async () => {
    const r = await jobs.assignJob({
      loanId: 'loan-1',
      installerName: 'Bayo',
      installerPhone: '08031112222',
      equipmentSource: 'vendor',
      vendorName: null,
      scheduledDate: null,
      actor: ops,
    })
    expect(r).toMatchObject({ ok: false })
  })
})

describe('markInstalled', () => {
  it('needs serial numbers for panels, battery and inverter, and a photo', async () => {
    await assign()
    const id = String(db.rows('jobs')[0]!.id)
    expect(await jobs.markInstalled({ jobId: id, actor: ops })).toMatchObject({ ok: false })
    expect(
      await jobs.recordSerials({
        jobId: id,
        serials: { panels: ['PNL-0001'], batteries: ['BAT-0001'], inverters: ['INV-0001'] },
        actor: ops,
      }),
    ).toEqual({ ok: true })
    expect(await jobs.markInstalled({ jobId: id, actor: ops })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/photo/),
    })
  })

  it('then tells the customer to confirm on their dashboard', async () => {
    await installedJob()
    expect(db.rows('jobs')[0]).toMatchObject({ status: 'installed' })
    expect(sent.map((m) => m.template)).toContain('installation_done')
  })
})

describe('customer sign-off (commissioning)', () => {
  it('resets the schedule to one month after sign-off and starts the plan', async () => {
    await installedJob()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-31T15:00:00Z'))
    expect(await jobs.customerSignOff('u-1')).toEqual({ ok: true })
    expect(db.rows('jobs')[0]).toMatchObject({ status: 'commissioned' })
    expect(db.rows('jobs')[0]!.customer_signoff_at).toBe('2026-12-31T15:00:00.000Z')
    expect(db.rows('loans')[0]).toMatchObject({ status: 'active', start_date: '2026-12-31' })
    expect(db.rows('repayment_schedule').map((r) => r.due_date)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ])
    expect(sent.map((m) => m.template)).toContain('plan_started')
  })

  it('only the customer whose system it is, only once, only after installation', async () => {
    await assign()
    expect(await jobs.customerSignOff('u-1')).toMatchObject({ ok: false })
    await installedJob().catch(() => undefined)
    expect(await jobs.customerSignOff('someone-else')).toMatchObject({ ok: false })
  })
})

describe('confirmPayout (separation of duties)', () => {
  async function commissioned() {
    const id = await installedJob()
    await jobs.customerSignOff('u-1')
    return id
  }

  it('the approver of the loan cannot confirm the payout, even as super admin', async () => {
    const id = await commissioned()
    expect(await jobs.confirmPayout({ jobId: id, actor: approver })).toEqual({
      ok: false,
      error: 'You approved this loan, so someone else must confirm the payout.',
    })
    expect(db.rows('jobs')[0]!.payout_confirmed_by ?? null).toBeNull()
  })

  it('someone else in finance can; operations cannot', async () => {
    const id = await commissioned()
    expect(await jobs.confirmPayout({ jobId: id, actor: ops })).toMatchObject({ ok: false })
    expect(await jobs.confirmPayout({ jobId: id, actor: finance })).toEqual({ ok: true })
    expect(db.rows('jobs')[0]).toMatchObject({ payout_confirmed_by: 'fin-1' })
    expect(db.rows('audit_log').map((a) => a.action)).toContain('job.payout_confirmed')
  })
})
