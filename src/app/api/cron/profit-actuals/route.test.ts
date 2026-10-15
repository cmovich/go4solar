import { beforeEach, describe, expect, it, vi } from 'vitest'

import { priceQuote } from '@/lib/pricing/price'
import { sampleQuoteInput } from '@/lib/pricing/pricing.fixture'
import { loanProfit } from '@/lib/profit/loanProfit'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))

process.env.CRON_SECRET = 'cron-secret-for-tests'
const { GET } = await import('./route')

const quote = priceQuote({ ...sampleQuoteInput, tenureMonths: 12 })
const approved = loanProfit({
  systemPrice: quote.systemPrice,
  costPrice: quote.costPrice,
  deposit: quote.deposit,
  tenureMonths: 12,
  funderAnnualRate: 0.2,
  funderMethod: 'flat',
  unitCosts: { kycPerLoan: 10000, feePerInstalment: 300, lossProvisionShare: 0.02 },
})

beforeEach(() => {
  db = fakeSupabase()
  db.seed('profiles', { id: 'u-1', is_test: false })
  db.seed('applications', {
    id: 'app-1',
    consumer_id: 'u-1',
    personal: { firstName: 'Ada' },
    applicant_type: 'individual',
  })
  db.seed('quotes', { id: 'q-1', tenure: 12, result: quote })
  db.seed('funders', {
    id: 'f-1',
    name: 'SPEWA programme funds',
    annual_rate: 0.16,
    status: 'active',
    is_test: false,
  })
  db.seed('unit_costs', {
    id: 1,
    kyc_per_loan: 10000,
    fee_per_instalment: 300,
    loss_provision_share: 0.02,
    min_net_margin_share: 0.1,
  })
  db.seed('loans', {
    id: 'loan-1',
    application_id: 'app-1',
    consumer_id: 'u-1',
    quote_id: 'q-1',
    funder_id: 'f-1',
    status: 'active',
    tenure: 12,
    system_price: quote.systemPrice,
    cost_price: quote.costPrice,
    deposit: quote.deposit,
    balance: quote.balance,
    drawn: approved.drawn,
    start_date: '2026-10-15',
    profit_snapshot: { stage: 'approved', funderName: 'Trade Lenda', profit: approved },
  })
  db.seed('payments', {
    application_id: 'app-1',
    loan_id: 'loan-1',
    kind: 'deposit',
    status: 'success',
    amount: quote.deposit,
    fee: 2000,
    paid_at: '2026-10-01T10:00:00Z',
  })
})

const call = (auth?: string) =>
  GET(
    new Request('http://localhost/api/cron/profit-actuals', {
      headers: auth ? { authorization: auth } : {},
    }),
  )

describe('GET /api/cron/profit-actuals', () => {
  it('refuses calls without the cron secret', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(db.rows('loan_profit_snapshots')).toHaveLength(0)
  })

  it('writes Quoted, Approved and this month’s Actual, once each, however often it runs', async () => {
    expect((await call('Bearer cron-secret-for-tests')).status).toBe(200)
    expect((await call('Bearer cron-secret-for-tests')).status).toBe(200)
    const rows = db.rows('loan_profit_snapshots')
    expect(rows.map((r) => r.stage).sort()).toEqual(['actual', 'approved', 'quoted'])
    const quoted = rows.find((r) => r.stage === 'quoted')!.data as {
      funderName: string
      profit: { netProfit: number }
    }
    // Quoted uses the default funder (first active real funder), Approved the funder picked.
    expect(quoted.funderName).toBe('SPEWA programme funds')
    expect(quoted.profit.netProfit).toBeGreaterThan(approved.netProfit)
    const actual = rows.find((r) => r.stage === 'actual')!
    expect(actual.month).toMatch(/^\d{4}-\d{2}-01$/)
    expect(actual.data).toMatchObject({ collected: quote.deposit, recordedFees: 2000 })
  })
})
