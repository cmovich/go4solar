/**
 * Profit dashboard numbers from loans as they stand (PRD "Dashboard views"). Pure: no database.
 *  - booked:    approved net profit on every signed loan
 *  - collected: net profit × (money received ÷ total amount payable), per payment
 *  - at risk:   profit still to come on loans 30 or more days late (PAR30)
 *  - grand total: collected profit − overheads to date
 * Funder repayments follow the approved snapshot: funderMonthly, monthly from the start date.
 */
export type LoanFacts = {
  id: string
  status: 'pending_approval' | 'approved' | 'active' | 'completed' | 'defaulted' | 'cancelled'
  funderId: string | null
  funderName: string | null
  state: string | null
  tenure: number
  depositShare: number
  applicantType: string
  installer: string | null
  systemPrice: number
  deposit: number
  balance: number
  /** Lagos date the plan started (customer sign-off), or null before commissioning. */
  startDate: string | null
  netProfit: number
  netPerMonth: number
  drawn: number
  funderInterest: number
  funderMonthly: number
  annualReturn: number | null
  schedule: {
    n: number
    dueDate: string
    amount: number
    paidAmount: number
    paidAt: string | null
  }[]
  /** Successful payments only. */
  payments: { kind: 'deposit' | 'instalment' | 'refund'; amount: number; paidAt: string }[]
}

export type CustomerProfit = {
  loanId: string
  status: 'not_started' | 'on_time' | 'late' | 'paid_off' | 'defaulted'
  daysOverdue: number
  par30: boolean
  monthlyProfit: number
  collected: number
  profitToDate: number
  profitToCome: number
  expectedByNow: number
  actualVsPlan: number
}

const DAY = 86_400_000
const lagosDay = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10)
const monthKey = (iso: string) =>
  lagosDay(new Date(iso.length === 10 ? `${iso}T12:00:00+01:00` : iso)).slice(0, 7)
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

/** start + k months (same day, month-end safe), as YYYY-MM-DD. */
function addMonths(start: string, k: number): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number]
  const last = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + k, Math.min(d, last))).toISOString().slice(0, 10)
}

const SIGNED = new Set(['approved', 'active', 'completed', 'defaulted'])

export function depositBand(share: number): string {
  if (share >= 0.5) return '50%+'
  if (share >= 0.4) return '40–49%'
  if (share >= 0.3) return '30–39%'
  return '20–29%'
}

function customerProfit(l: LoanFacts, today: string): CustomerProfit {
  const perNaira = l.systemPrice > 0 ? l.netProfit / l.systemPrice : 0
  const collected = l.payments.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0)
  const profitToDate = Math.round(collected * perNaira)
  const unpaidPastDue = l.schedule.filter((r) => r.paidAmount < r.amount && r.dueDate < today)
  const oldest = unpaidPastDue.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const daysOverdue = oldest ? daysBetween(oldest.dueDate, today) : 0
  const expectedByNow =
    l.deposit + l.schedule.filter((r) => r.dueDate <= today).reduce((s, r) => s + r.amount, 0)
  const status: CustomerProfit['status'] =
    l.status === 'completed'
      ? 'paid_off'
      : l.status === 'defaulted'
        ? 'defaulted'
        : l.status !== 'active'
          ? 'not_started'
          : daysOverdue > 0
            ? 'late'
            : 'on_time'
  return {
    loanId: l.id,
    status,
    daysOverdue,
    par30: daysOverdue >= 30,
    monthlyProfit: l.netPerMonth,
    collected,
    profitToDate,
    profitToCome: l.netProfit - profitToDate,
    expectedByNow,
    actualVsPlan: collected - expectedByNow,
  }
}

type Group = {
  key: string
  customers: number
  avgNetProfit: number
  avgAnnualReturn: number | null
}
function groupBy(loans: LoanFacts[], keyOf: (l: LoanFacts) => string): Group[] {
  const map = new Map<string, LoanFacts[]>()
  for (const l of loans) map.set(keyOf(l), [...(map.get(keyOf(l)) ?? []), l])
  return [...map.entries()]
    .map(([key, ls]) => {
      const returns = ls.map((l) => l.annualReturn).filter((r): r is number => r !== null)
      return {
        key,
        customers: ls.length,
        avgNetProfit: Math.round(ls.reduce((s, l) => s + l.netProfit, 0) / ls.length),
        avgAnnualReturn: returns.length
          ? returns.reduce((a, b) => a + b, 0) / returns.length
          : null,
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }))
}

export function portfolio(
  all: LoanFacts[],
  opts: { now: Date; overheadsToDate: number; lossProvisionShare: number },
) {
  const today = lagosDay(opts.now)
  const thisMonth = today.slice(0, 7)
  const thisYear = today.slice(0, 4)
  const loans = all.filter((l) => SIGNED.has(l.status))
  const customers = loans.map((l) => customerProfit(l, today))
  const byId = new Map(customers.map((c) => [c.loanId, c]))

  // Month by month: profit collected, cash in, funder repayments out.
  const months = new Map<
    string,
    { month: string; profitCollected: number; cashIn: number; funderOut: number }
  >()
  const bucket = (k: string) => {
    if (!months.has(k)) months.set(k, { month: k, profitCollected: 0, cashIn: 0, funderOut: 0 })
    return months.get(k)!
  }
  let profitThisMonth = 0
  let profitThisYear = 0
  for (const l of loans) {
    const perNaira = l.systemPrice > 0 ? l.netProfit / l.systemPrice : 0
    for (const p of l.payments) {
      const signed = p.kind === 'refund' ? -p.amount : p.amount
      const k = monthKey(p.paidAt)
      const b = bucket(k)
      b.cashIn += signed
      b.profitCollected += signed * perNaira
      if (k === thisMonth) profitThisMonth += signed * perNaira
      if (k.startsWith(thisYear)) profitThisYear += signed * perNaira
    }
    if (l.startDate) {
      for (let k = 1; k <= l.tenure; k++)
        bucket(addMonths(l.startDate, k).slice(0, 7)).funderOut += l.funderMonthly
    }
  }

  // Funders: scheduled repayments (one funderMonthly a month from the start date).
  const in90 = lagosDay(new Date(opts.now.getTime() + 90 * DAY))
  const nextMonth = addMonths(`${thisMonth}-01`, 1).slice(0, 7)
  const funders = new Map<
    string,
    {
      funderId: string
      funderName: string
      drawn: number
      repaid: number
      outstanding: number
      interestPaid: number
      dueNext90Days: number
      dueNextMonth: number
      collectionsNextMonth: number
      cashGap: boolean
    }
  >()
  for (const l of loans) {
    if (!l.funderId) continue
    const f = funders.get(l.funderId) ?? {
      funderId: l.funderId,
      funderName: l.funderName ?? 'Funder',
      drawn: 0,
      repaid: 0,
      outstanding: 0,
      interestPaid: 0,
      dueNext90Days: 0,
      dueNextMonth: 0,
      collectionsNextMonth: 0,
      cashGap: false,
    }
    const owed = l.drawn + l.funderInterest
    let repaid = 0
    if (l.startDate) {
      for (let k = 1; k <= l.tenure; k++) {
        const date = addMonths(l.startDate, k)
        if (date <= today) repaid += l.funderMonthly
        else if (date <= in90) f.dueNext90Days += l.funderMonthly
        if (date.slice(0, 7) === nextMonth) f.dueNextMonth += l.funderMonthly
      }
    }
    f.collectionsNextMonth += l.schedule
      .filter((r) => r.dueDate.slice(0, 7) === nextMonth)
      .reduce((s, r) => s + r.amount - r.paidAmount, 0)
    f.drawn += l.drawn
    f.repaid += repaid
    f.outstanding += owed - repaid
    f.interestPaid += owed > 0 ? Math.round((repaid * l.funderInterest) / owed) : 0
    funders.set(l.funderId, f)
  }
  for (const f of funders.values()) f.cashGap = f.dueNextMonth > f.collectionsNextMonth

  // Risk: outstanding customer balances, the share 30+ days late, and the provision.
  const active = loans.filter((l) => l.status === 'active')
  const outstandingOf = (l: LoanFacts) =>
    l.balance - l.schedule.reduce((s, r) => s + r.paidAmount, 0)
  const outstanding = active.reduce((s, l) => s + outstandingOf(l), 0)
  const par30Balance = active
    .filter((l) => byId.get(l.id)!.par30)
    .reduce((s, l) => s + outstandingOf(l), 0)

  const collected = customers.reduce((s, c) => s + c.profitToDate, 0)
  return {
    customers,
    totals: {
      booked: loans.reduce((s, l) => s + l.netProfit, 0),
      collected,
      atRisk: customers.filter((c) => c.par30).reduce((s, c) => s + c.profitToCome, 0),
      profitThisMonth: Math.round(profitThisMonth),
      profitThisYear: Math.round(profitThisYear),
      allTime: collected,
      grandTotal: collected - opts.overheadsToDate,
    },
    months: [...months.values()]
      .map((m) => ({ ...m, profitCollected: Math.round(m.profitCollected) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    funders: [...funders.values()],
    byTenure: groupBy(loans, (l) => `${l.tenure} months`),
    byDepositBand: groupBy(loans, (l) => depositBand(l.depositShare)),
    risk: {
      outstanding,
      par30Balance,
      par30Share: outstanding > 0 ? par30Balance / outstanding : 0,
      provision: Math.round(opts.lossProvisionShare * outstanding),
    },
  }
}

export type Portfolio = ReturnType<typeof portfolio>
