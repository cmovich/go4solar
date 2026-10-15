import { describe, expect, it } from 'vitest'

import { portfolio, type LoanFacts } from './portfolio'

const now = new Date('2026-12-15T12:00:00Z')

// A loan approved with ₦413,251 net, ₦2,475,248 total payable, ₦495,050 deposit, 12 × ₦165,017.
function loan(over: Partial<LoanFacts> = {}): LoanFacts {
  return {
    id: 'L1',
    status: 'active',
    funderId: 'F1',
    funderName: 'Funder A',
    state: 'Lagos',
    tenure: 12,
    depositShare: 0.2,
    applicantType: 'individual',
    installer: 'Bayo Installs',
    systemPrice: 2475248,
    deposit: 495050,
    balance: 1980198,
    startDate: '2026-10-15',
    netProfit: 413251,
    netPerMonth: 34438,
    drawn: 1304950,
    funderInterest: 208792,
    funderMonthly: 126145,
    annualReturn: 0.317,
    schedule: Array.from({ length: 12 }, (_, i) => ({
      n: i + 1,
      dueDate: `${i < 2 ? '2026' : '2027'}-${String(((10 + i) % 12) + 1).padStart(2, '0')}-15`,
      amount: 165017,
      paidAmount: 0,
      paidAt: null,
    })),
    payments: [{ kind: 'deposit', amount: 495050, paidAt: '2026-10-01T10:00:00Z' }],
    ...over,
  }
}

describe('portfolio (per customer)', () => {
  it('collected profit follows the share of the total amount payable received', () => {
    const p = portfolio([loan()], { now, overheadsToDate: 0, lossProvisionShare: 0.02 })
    const c = p.customers[0]!
    expect(c.collected).toBe(495050)
    expect(c.profitToDate).toBe(Math.round(413251 * (495050 / 2475248)))
    expect(c.profitToCome).toBe(413251 - c.profitToDate)
    expect(c.monthlyProfit).toBe(34438)
  })

  it('status: on time, late (overdue), and PAR30 when 30+ days overdue', () => {
    // Due 15 Nov unpaid on 15 Dec = 30 days overdue → PAR30; due 15 Dec is today → not late yet.
    const p = portfolio([loan()], { now, overheadsToDate: 0, lossProvisionShare: 0.02 })
    expect(p.customers[0]).toMatchObject({ status: 'late', daysOverdue: 30, par30: true })
    const paid = loan({
      schedule: loan().schedule.map((r) =>
        r.n <= 2 ? { ...r, paidAmount: r.amount, paidAt: r.dueDate } : r,
      ),
    })
    expect(
      portfolio([paid], { now, overheadsToDate: 0, lossProvisionShare: 0.02 }).customers[0],
    ).toMatchObject({
      status: 'on_time',
      daysOverdue: 0,
      par30: false,
    })
  })

  it('actual against plan: collected minus what was due by now', () => {
    const p = portfolio([loan()], { now, overheadsToDate: 0, lossProvisionShare: 0.02 })
    // Due by 15 Dec: deposit + 2 instalments (15 Nov, 15 Dec).
    expect(p.customers[0]!.expectedByNow).toBe(495050 + 2 * 165017)
    expect(p.customers[0]!.actualVsPlan).toBe(-2 * 165017)
  })
})

describe('portfolio (totals)', () => {
  const paidNov = loan({
    id: 'L2',
    schedule: loan().schedule.map((r) =>
      r.n === 1 ? { ...r, paidAmount: r.amount, paidAt: '2026-11-15T09:00:00Z' } : r,
    ),
    payments: [
      { kind: 'deposit', amount: 495050, paidAt: '2026-10-01T10:00:00Z' },
      { kind: 'instalment', amount: 165017, paidAt: '2026-11-15T09:00:00Z' },
      { kind: 'instalment', amount: 165017, paidAt: '2026-12-10T09:00:00Z' },
    ],
  })
  const pending = loan({
    id: 'L3',
    status: 'approved',
    startDate: null,
    payments: [],
    schedule: [],
  })
  const p = portfolio([paidNov, pending], {
    now,
    overheadsToDate: 100000,
    lossProvisionShare: 0.02,
  })

  it('booked = net on every signed loan; collected = profit received; grand total after overheads', () => {
    expect(p.totals.booked).toBe(2 * 413251)
    const perNaira = 413251 / 2475248
    expect(p.totals.collected).toBe(Math.round((495050 + 2 * 165017) * perNaira))
    expect(p.totals.profitThisMonth).toBe(Math.round(165017 * perNaira))
    expect(p.totals.profitThisYear).toBe(p.totals.collected)
    expect(p.totals.grandTotal).toBe(p.totals.collected - 100000)
  })

  it('at risk = profit still to come on loans 30+ days late', () => {
    const late = portfolio([loan()], { now, overheadsToDate: 0, lossProvisionShare: 0.02 })
    expect(late.totals.atRisk).toBe(late.customers[0]!.profitToCome)
    expect(p.totals.atRisk).toBe(0)
  })

  it('cash in by month and funder repayments out by month', () => {
    expect(p.months.find((m) => m.month === '2026-10')).toMatchObject({ cashIn: 495050 })
    expect(p.months.find((m) => m.month === '2026-11')).toMatchObject({
      cashIn: 165017,
      funderOut: 126145,
    })
  })

  it('funders: drawn, repaid so far, outstanding, due next 90 days, cash-gap alert', () => {
    const f = p.funders.find((x) => x.funderId === 'F1')!
    expect(f.drawn).toBe(2 * 1304950)
    // L2 started 15 Oct: funder payments on 15 Nov and 15 Dec are due by now.
    expect(f.repaid).toBe(2 * 126145)
    expect(f.outstanding).toBe(2 * (1304950 + 208792) - 2 * 126145)
    expect(f.dueNext90Days).toBe(3 * 126145)
    expect(f.cashGap).toBe(false)
  })

  it('profit by tenure and deposit band: per customer and annual return on funder money', () => {
    expect(p.byTenure).toEqual([
      { key: '12 months', customers: 2, avgNetProfit: 413251, avgAnnualReturn: 0.317 },
    ])
    expect(p.byDepositBand[0]).toMatchObject({ key: '20–29%', customers: 2 })
  })

  it('PAR30 against the provision', () => {
    const late = portfolio([loan()], { now, overheadsToDate: 0, lossProvisionShare: 0.02 })
    expect(late.risk.outstanding).toBe(1980198)
    expect(late.risk.par30Share).toBe(1)
    expect(late.risk.provision).toBe(Math.round(0.02 * 1980198))
  })
})
