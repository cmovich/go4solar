import { beforeEach, describe, expect, it, vi } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const sent: { channel: string; template: string }[] = []
vi.mock('@/lib/providers/messaging', () => ({
  getMessagingProvider: async () => ({
    send: async (m: { channel: string; template: string }) => (
      sent.push(m),
      { id: 'm', status: 'queued' }
    ),
  }),
}))
const refundDeposit = vi.fn(async () => ({ ok: true, status: 'processed' }))
vi.mock('@/lib/payments/server', () => ({ refundDeposit: () => refundDeposit() }))

const { routeAfterDeposit } = await import('./route')
const queue = await import('./server')
const approvals = await import('@/lib/approvals/server')

const SPEWA = '9cd547fb-0cf8-4bd1-8f32-b68a3a6e961d'
const APP = '11111111-1111-4111-8111-111111111111'
const APP2 = '22222222-2222-4222-8222-222222222222'
const approver = { id: 'spewa-1', role: 'funder_approver' as const }
const boss = { id: 'boss-1', role: 'super_admin' as const }
const officer = { id: 'officer-1', role: 'credit_officer' as const }

function seedApp(id: string, opts: { type?: string; share?: number; isTest?: boolean } = {}) {
  const quote = priceQuote({
    ...sampleQuoteInput,
    tenureMonths: 12,
    depositShare: opts.share ?? 0.3,
  })
  const consumer = `u-${id}`
  db.seed('applications', {
    id,
    consumer_id: consumer,
    status: 'submitted',
    applicant_type: opts.type ?? 'business',
    quote_id: `q-${id}`,
    personal: { firstName: 'Ada', email: 'ada@x.test', phone: '+2348031234567' },
    business: { registeredName: 'Bingham Ventures Ltd' },
    credit_flags: {},
  })
  db.seed('quotes', { id: `q-${id}`, tenure: 12, result: quote })
  db.seed('loans', {
    id: `loan-${id}`,
    application_id: id,
    consumer_id: consumer,
    system_price: quote.systemPrice,
    cost_price: quote.costPrice,
    deposit: quote.deposit,
    balance: quote.balance,
    tenure: 12,
    status: 'pending_approval',
  })
  db.seed('payments', {
    application_id: id,
    kind: 'deposit',
    status: 'success',
    amount: quote.deposit,
    fee: 2000,
  })
  db.seed('agreements', { application_id: id, type: 'consumer' })
  db.seed('guarantees', { application_id: id, status: 'signed' })
  for (const kind of ['cac', 'nin', 'bvn', 'liveness'])
    db.seed('kyc_checks', { subject_id: id, kind, status: 'passed', attempt: 1 })
  db.seed('profiles', { id: consumer, is_test: Boolean(opts.isTest) })
  return quote
}

function seed() {
  db = fakeSupabase({
    funder_draws: [['loan_id']],
    loans: [['application_id']],
    funder_queue: [['application_id']],
  })
  db.defineFunction('draw_from_funder', ({ p_funder, p_amount }) => {
    const f = db.rows('funders').find((r) => r.id === p_funder)!
    if (Number(f.balance_available) < Number(p_amount)) return null
    f.balance_available = Number(f.balance_available) - Number(p_amount)
    return f.balance_available
  })
  const funder = (id: string, name: string, isTest: boolean, balance = 50_000_000) => ({
    id,
    name,
    annual_rate: 0.16,
    min_amount: 0,
    max_amount: null,
    max_tenure: 12,
    balance_available: balance,
    status: 'active',
    is_test: isTest,
  })
  db.seed('funders', funder(SPEWA, 'SPEWA programme funds', false))
  db.seed('funders', funder('fund-other', 'Trade Lenda', false))
  db.seed('funders', funder('fund-test', 'E2E TEST FUNDER', true, 900_000_000_000))
  db.seed('unit_costs', {
    id: 1,
    kyc_per_loan: 10000,
    fee_per_instalment: 300,
    loss_provision_share: 0.02,
    min_net_margin_share: 0,
  })
  // A low credit officer limit: the funder approver is not bound by it.
  db.seed('settings', { key: 'approval_limit_credit_officer', value: 1 })
  db.seed('funder_routing_rules', {
    funder_id: SPEWA,
    applicant_type: 'business',
    min_deposit_share: 0.3,
    tenures: [3, 6, 9, 12],
    offer: 'spewa',
    is_default: true,
    active: true,
    sort_order: 1,
  })
}

const queueRow = (id: string) => db.rows('funder_queue').find((r) => r.application_id === id)
const auditOf = (action: string) => db.rows('audit_log').filter((r) => r.action === action)

beforeEach(() => {
  vi.clearAllMocks()
  sent.length = 0
  seed()
})

describe('routeAfterDeposit', () => {
  it('a business with a 30% deposit goes to the SPEWA queue (once, audited)', async () => {
    seedApp(APP, { share: 0.3 })
    await routeAfterDeposit(APP)
    await routeAfterDeposit(APP)
    expect(db.rows('funder_queue')).toHaveLength(1)
    expect(queueRow(APP)).toMatchObject({ funder_id: SPEWA, deposit_share: 0.3, is_test: false })
    expect(auditOf('application.route_funder')).toHaveLength(1)
  })
  it('20% deposit, or an individual, stays in the general queue', async () => {
    seedApp(APP, { share: 0.2 })
    seedApp(APP2, { type: 'individual', share: 0.5 })
    await routeAfterDeposit(APP)
    await routeAfterDeposit(APP2)
    expect(db.rows('funder_queue')).toHaveLength(0)
  })
  it('test customers are routed and marked test', async () => {
    seedApp(APP, { share: 0.4, isTest: true })
    await routeAfterDeposit(APP)
    expect(queueRow(APP)?.is_test).toBe(true)
  })
  it('never throws (the deposit must still be recorded)', async () => {
    await expect(routeAfterDeposit('missing')).resolves.toBeUndefined()
  })
})

describe('the general queue leaves SPEWA files alone', () => {
  it('approve and decline are refused while SPEWA has not decided', async () => {
    seedApp(APP)
    await routeAfterDeposit(APP)
    const a = await approvals.approveApplication({
      applicationId: APP,
      funderId: SPEWA,
      actor: boss,
    })
    expect(a).toMatchObject({ ok: false, error: expect.stringContaining('SPEWA') })
    const d = await approvals.declineApplication({ applicationId: APP, reason: 'No', actor: boss })
    expect(d).toMatchObject({ ok: false, error: expect.stringContaining('SPEWA') })
    expect(refundDeposit).not.toHaveBeenCalled()
  })
  it('after SPEWA declines, our staff decide it as usual', async () => {
    seedApp(APP)
    await routeAfterDeposit(APP)
    await queue.decideFunderQueue(
      { ids: [APP], decision: 'decline', reason: 'Outside our programme' },
      approver,
    )
    const a = await approvals.approveApplication({
      applicationId: APP,
      funderId: 'fund-other',
      actor: boss,
    })
    expect(a).toEqual({ ok: true })
  })
})

describe('decideFunderQueue', () => {
  beforeEach(async () => {
    seedApp(APP)
    seedApp(APP2)
    await routeAfterDeposit(APP)
    await routeAfterDeposit(APP2)
  })

  it('only the funder approver or a super admin', async () => {
    expect(
      await queue.decideFunderQueue({ ids: [APP], decision: 'approve' }, officer),
    ).toMatchObject({
      ok: false,
    })
    expect(queueRow(APP)?.decision).toBe('pending')
  })

  it('approve: final approval with SPEWA (drawn from SPEWA, customer told, audited)', async () => {
    const res = await queue.decideFunderQueue({ ids: [APP], decision: 'approve' }, approver)
    expect(res).toEqual({ ok: true, results: [{ id: APP, ok: true }] })
    expect(queueRow(APP)).toMatchObject({ decision: 'approved', decided_by: approver.id })
    expect(queueRow(APP)?.decided_at).toBeTruthy()
    const loan = db.rows('loans').find((l) => l.application_id === APP)!
    expect(loan).toMatchObject({ status: 'approved', funder_id: SPEWA, approved_by: approver.id })
    expect(db.rows('applications').find((a) => a.id === APP)?.status).toBe('approved')
    expect(db.rows('funder_draws')).toHaveLength(1)
    expect(sent.some((m) => m.template === 'application_approved')).toBe(true)
    expect(auditOf('funder_queue.approve')).toMatchObject([
      { actor_id: approver.id, entity_id: APP },
    ])
    expect(auditOf('application.approve')[0]?.after).toMatchObject({ via: 'funder_queue' })
  })

  it('bulk approve: each file decided and audited on its own; a repeat is refused', async () => {
    const res = await queue.decideFunderQueue({ ids: [APP, APP2], decision: 'approve' }, boss)
    expect(res).toEqual({
      ok: true,
      results: [
        { id: APP, ok: true },
        { id: APP2, ok: true },
      ],
    })
    expect(auditOf('funder_queue.approve')).toHaveLength(2)
    const again = await queue.decideFunderQueue({ ids: [APP], decision: 'approve' }, boss)
    expect(again).toEqual({
      ok: true,
      results: [{ id: APP, ok: false, error: 'Already decided.' }],
    })
    expect(db.rows('funder_draws')).toHaveLength(2)
  })

  it('approve fails (SPEWA balance too low): the file stays pending', async () => {
    db.rows('funders').find((f) => f.id === SPEWA)!.balance_available = 1
    const res = await queue.decideFunderQueue({ ids: [APP], decision: 'approve' }, approver)
    expect(res).toMatchObject({ ok: true, results: [{ id: APP, ok: false }] })
    expect(queueRow(APP)?.decision).toBe('pending')
    expect(db.rows('loans').find((l) => l.application_id === APP)?.status).toBe('pending_approval')
  })

  it('a blocker (KYC in manual review) stops the approval', async () => {
    db.rows('kyc_checks').find((c) => c.subject_id === APP && c.kind === 'nin')!.status =
      'manual_review'
    const res = await queue.decideFunderQueue({ ids: [APP], decision: 'approve' }, approver)
    expect(res).toMatchObject({ ok: true, results: [{ id: APP, ok: false }] })
    expect(queueRow(APP)?.decision).toBe('pending')
  })

  it('decline (bulk): back to the general queue, no refund, reason and who recorded', async () => {
    const res = await queue.decideFunderQueue(
      { ids: [APP, APP2], decision: 'decline', reason: 'Outside our programme' },
      approver,
    )
    expect(res).toMatchObject({ ok: true, results: [{ ok: true }, { ok: true }] })
    expect(queueRow(APP)).toMatchObject({
      decision: 'declined',
      decided_by: approver.id,
      decision_reason: 'Outside our programme',
    })
    expect(db.rows('applications').find((a) => a.id === APP)?.status).toBe('submitted')
    expect(refundDeposit).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
    expect(auditOf('funder_queue.decline')).toHaveLength(2)
  })

  it('test customers draw on the test funder, never SPEWA', async () => {
    seed()
    seedApp(APP, { isTest: true })
    await routeAfterDeposit(APP)
    const res = await queue.decideFunderQueue({ ids: [APP], decision: 'approve' }, approver)
    expect(res).toEqual({ ok: true, results: [{ id: APP, ok: true }] })
    expect(db.rows('loans').find((l) => l.application_id === APP)?.funder_id).toBe('fund-test')
  })

  it('a file that is not in the queue', async () => {
    const res = await queue.decideFunderQueue(
      { ids: ['33333333-3333-4333-8333-333333333333'], decision: 'approve' },
      approver,
    )
    expect(res).toMatchObject({ ok: true, results: [{ ok: false }] })
  })
})

describe('recordCheques', () => {
  beforeEach(async () => {
    seedApp(APP)
    await routeAfterDeposit(APP)
  })
  it('our staff record yes / number / date (audited); the funder approver cannot', async () => {
    expect(
      await queue.recordCheques(
        APP,
        { received: 'yes', count: '12', receivedOn: '2026-11-01' },
        officer,
      ),
    ).toEqual({ ok: true })
    expect(queueRow(APP)).toMatchObject({
      cheques_received: true,
      cheques_count: 12,
      cheques_received_on: '2026-11-01',
      cheques_updated_by: officer.id,
    })
    expect(auditOf('funder_queue.cheques')).toHaveLength(1)
    expect(await queue.recordCheques(APP, { received: 'no' }, approver)).toMatchObject({
      ok: false,
    })
  })
  it('a wrong entry is refused', async () => {
    expect(
      await queue.recordCheques(APP, { received: 'yes', count: '', receivedOn: '' }, officer),
    ).toMatchObject({ ok: false, error: expect.stringContaining('number') })
  })
})

describe('funderQueueList', () => {
  it('lists routed files with the business name, deposit share and decision; test hidden', async () => {
    seedApp(APP)
    seedApp(APP2, { isTest: true })
    await routeAfterDeposit(APP)
    await routeAfterDeposit(APP2)
    const list = await queue.funderQueueList({ includeTest: false })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: APP,
      name: 'Bingham Ventures Ltd',
      depositShare: 0.3,
      decision: 'pending',
      repayment: null,
    })
    expect(await queue.funderQueueList({ includeTest: true })).toHaveLength(2)
    expect(await queue.funderQueueList({ includeTest: true, decision: 'approved' })).toHaveLength(0)
  })
})
