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
const refundDeposit = vi.fn<(applicationId: string) => Promise<{ ok: true; status: 'processed' }>>(
  async () => ({ ok: true, status: 'processed' }),
)
vi.mock('@/lib/payments/server', () => ({ refundDeposit: (id: string) => refundDeposit(id) }))

const approvals = await import('./server')

const quote = priceQuote({ ...sampleQuoteInput, tenureMonths: 12 })
const drawn = Math.max(0, quote.costPrice - quote.deposit)
const officer = { id: 'officer-1', role: 'credit_officer' as const }
const boss = { id: 'boss-1', role: 'super_admin' as const }

function seed({ guarantorSigned = true, limit = 100_000_000, balance = 50_000_000 } = {}) {
  db = fakeSupabase({ funder_draws: [['loan_id']], loans: [['application_id']] })
  db.defineFunction('draw_from_funder', ({ p_funder, p_amount }) => {
    const f = db.rows('funders').find((r) => r.id === p_funder)!
    if (f.status !== 'active' || Number(f.balance_available) < Number(p_amount)) return null
    f.balance_available = Number(f.balance_available) - Number(p_amount)
    return f.balance_available
  })
  db.seed('applications', {
    id: 'app-1',
    consumer_id: 'u-1',
    status: 'submitted',
    applicant_type: 'individual',
    quote_id: 'q-1',
    personal: { firstName: 'Ada', email: 'ada@x.test', phone: '+2348031234567' },
    credit_flags: {},
  })
  db.seed('quotes', { id: 'q-1', tenure: 12, result: quote })
  db.seed('loans', {
    id: 'loan-1',
    application_id: 'app-1',
    consumer_id: 'u-1',
    system_price: quote.systemPrice,
    cost_price: quote.costPrice,
    deposit: quote.deposit,
    balance: quote.balance,
    tenure: 12,
    status: 'pending_approval',
  })
  db.seed('payments', {
    application_id: 'app-1',
    kind: 'deposit',
    status: 'success',
    amount: quote.deposit,
    fee: 2000,
  })
  db.seed('agreements', { application_id: 'app-1', type: 'consumer' })
  db.seed('guarantees', { application_id: 'app-1', status: guarantorSigned ? 'signed' : 'invited' })
  for (const kind of ['nin', 'bvn', 'liveness'])
    db.seed('kyc_checks', {
      id: `chk-${kind}`,
      subject_id: 'app-1',
      kind,
      status: 'passed',
      attempt: 1,
    })
  db.seed('funders', {
    id: 'fund-a',
    name: 'Funder A',
    annual_rate: 0.16,
    min_amount: 0,
    max_amount: null,
    max_tenure: 12,
    balance_available: balance,
    status: 'active',
  })
  db.seed('unit_costs', {
    id: 1,
    kyc_per_loan: 10000,
    fee_per_instalment: 300,
    loss_provision_share: 0.02,
    min_net_margin_share: 0,
  })
  db.seed('settings', { key: 'approval_limit_credit_officer', value: limit })
}

beforeEach(() => {
  vi.clearAllMocks()
  sent.length = 0
  seed()
})

describe('approve', () => {
  it('is blocked until every condition is met', async () => {
    seed({ guarantorSigned: false })
    const r = await approvals.approveApplication({
      applicationId: 'app-1',
      funderId: 'fund-a',
      actor: officer,
    })
    expect(r).toEqual({
      ok: false,
      error: 'Not ready to approve.',
      blockers: ['Guarantor has not signed'],
    })
    expect(db.rows('loans')[0]).toMatchObject({ status: 'pending_approval' })
    expect(db.rows('funder_draws')).toHaveLength(0)
    expect(db.rows('audit_log')).toHaveLength(0)
  })

  it('a credit officer cannot approve above the limit; a super admin can', async () => {
    seed({ limit: 1_000 })
    const r = await approvals.approveApplication({
      applicationId: 'app-1',
      funderId: 'fund-a',
      actor: officer,
    })
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/credit officer limit/) })
    expect(db.rows('loans')[0]).toMatchObject({ status: 'pending_approval' })
    expect(
      await approvals.approveApplication({
        applicationId: 'app-1',
        funderId: 'fund-a',
        actor: boss,
      }),
    ).toEqual({ ok: true })
  })

  it('writes the profit snapshot, the draw on the funder, the audit log and tells the customer', async () => {
    expect(
      await approvals.approveApplication({
        applicationId: 'app-1',
        funderId: 'fund-a',
        actor: officer,
      }),
    ).toEqual({ ok: true })
    const loan = db.rows('loans')[0]!
    expect(loan).toMatchObject({
      status: 'approved',
      funder_id: 'fund-a',
      approved_by: 'officer-1',
      drawn,
    })
    const snap = loan.profit_snapshot as {
      stage: string
      funderId: string
      profit: { netProfit: number; drawn: number }
      recordedFees: number
    }
    expect(snap).toMatchObject({ stage: 'approved', funderId: 'fund-a', recordedFees: 2000 })
    expect(snap.profit.drawn).toBe(drawn)
    expect(db.rows('funders')[0]!.balance_available).toBe(50_000_000 - drawn)
    expect(db.rows('funder_draws')).toEqual([
      expect.objectContaining({
        funder_id: 'fund-a',
        loan_id: 'loan-1',
        amount: drawn,
        balance_after: 50_000_000 - drawn,
      }),
    ])
    expect(db.rows('applications')[0]).toMatchObject({
      status: 'approved',
      decided_by: 'officer-1',
      assigned_funder_id: 'fund-a',
    })
    expect(db.rows('audit_log')).toEqual([
      expect.objectContaining({
        actor_id: 'officer-1',
        action: 'application.approve',
        entity: 'applications',
        entity_id: 'app-1',
      }),
    ])
    expect(sent.map((m) => m.template)).toEqual([
      'application_approved',
      'application_approved',
      'application_approved',
    ])
  })

  it('cannot approve twice (one draw)', async () => {
    await approvals.approveApplication({
      applicationId: 'app-1',
      funderId: 'fund-a',
      actor: officer,
    })
    const again = await approvals.approveApplication({
      applicationId: 'app-1',
      funderId: 'fund-a',
      actor: boss,
    })
    expect(again.ok).toBe(false)
    expect(db.rows('funder_draws')).toHaveLength(1)
  })

  it('refuses a funder that does not have the balance', async () => {
    seed({ balance: 10 })
    const r = await approvals.approveApplication({
      applicationId: 'app-1',
      funderId: 'fund-a',
      actor: officer,
    })
    expect(r).toEqual({ ok: false, error: 'That funder is not eligible for this loan.' })
    expect(db.rows('loans')[0]).toMatchObject({ status: 'pending_approval' })
  })
})

describe('decline and more info', () => {
  it('decline needs a reason and triggers exactly one refund', async () => {
    expect(
      await approvals.declineApplication({ applicationId: 'app-1', reason: '', actor: officer }),
    ).toMatchObject({ ok: false })
    expect(
      await approvals.declineApplication({
        applicationId: 'app-1',
        reason: 'Income too low',
        actor: officer,
      }),
    ).toEqual({ ok: true })
    expect(
      await approvals.declineApplication({
        applicationId: 'app-1',
        reason: 'again',
        actor: officer,
      }),
    ).toMatchObject({ ok: false })
    expect(refundDeposit).toHaveBeenCalledTimes(1)
    expect(refundDeposit).toHaveBeenCalledWith('app-1')
    expect(db.rows('applications')[0]).toMatchObject({
      status: 'declined',
      decision_reason: 'Income too low',
    })
    expect(db.rows('audit_log').map((a) => a.action)).toEqual(['application.decline'])
  })

  it('request more info: status, message for the customer, notification', async () => {
    const r = await approvals.requestMoreInfo({
      applicationId: 'app-1',
      message: 'Please upload a clearer NIN slip',
      actor: officer,
    })
    expect(r).toEqual({ ok: true })
    expect(db.rows('applications')[0]).toMatchObject({
      status: 'more_info',
      more_info_request: 'Please upload a clearer NIN slip',
    })
    expect(sent.map((m) => m.template)).toContain('application_more_info')
  })
})

describe('manual review of KYC checks', () => {
  it('a credit officer clears a check in manual review (recorded with who and why)', async () => {
    db.rows('kyc_checks')[1]!.status = 'manual_review'
    const r = await approvals.reviewKycCheck({
      checkId: 'chk-bvn',
      outcome: 'clear',
      reason: 'Name matches the bank letter',
      actor: officer,
    })
    expect(r).toEqual({ ok: true })
    expect(db.rows('kyc_checks')[1]).toMatchObject({ status: 'passed' })
    expect(db.rows('kyc_checks')[1]!.result_summary).toMatchObject({
      review: { by: 'officer-1', outcome: 'clear' },
    })
    expect(db.rows('audit_log').map((a) => a.action)).toEqual(['kyc_check.clear'])
  })

  it('only checks in manual review can be reviewed; failing needs a reason', async () => {
    expect(
      await approvals.reviewKycCheck({
        checkId: 'chk-nin',
        outcome: 'clear',
        reason: 'x',
        actor: officer,
      }),
    ).toMatchObject({ ok: false })
    db.rows('kyc_checks')[0]!.status = 'manual_review'
    expect(
      await approvals.reviewKycCheck({
        checkId: 'chk-nin',
        outcome: 'fail',
        reason: '',
        actor: officer,
      }),
    ).toMatchObject({ ok: false })
  })
})
