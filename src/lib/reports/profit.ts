import 'server-only'

import { testProfileIds } from '@/lib/approvals/admin'
import { unitCostsRow } from '@/lib/approvals/server'
import type { QuoteResult } from '@/lib/pricing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

import { loanProfit } from '@/lib/profit/loanProfit'
import { depositBand, portfolio, type LoanFacts } from '@/lib/profit/portfolio'
import type { LoanProfit } from '@/lib/profit/types'

export type ProfitFilters = {
  funder?: string
  state?: string
  tenure?: string
  band?: string
  type?: string
  installer?: string
  includeTest?: boolean
}

type ApprovedSnapshot = { funderName?: string; profit?: LoanProfit }

/** Every signed loan as plain facts for the portfolio engine (test customers left out by default). */
export async function loadLoanFacts(
  includeTest = false,
): Promise<(LoanFacts & { customer: string; consumerId: string })[]> {
  const admin = createAdminClient()
  const [{ data: loans }, testIds] = await Promise.all([
    admin.from('loans').select('*').in('status', ['approved', 'active', 'completed', 'defaulted']),
    includeTest ? Promise.resolve(new Set<string>()) : testProfileIds(),
  ])
  const real = (loans ?? []).filter((l) => !testIds.has(l.consumer_id))
  if (!real.length) return []
  const ids = real.map((l) => l.id)
  const appIds = real.map((l) => l.application_id)
  const [apps, schedule, payments, jobs, funders] = await Promise.all([
    admin.from('applications').select('id, personal, applicant_type').in('id', appIds),
    admin.from('repayment_schedule').select('*').in('loan_id', ids).order('n'),
    admin
      .from('payments')
      .select('loan_id, application_id, kind, amount, paid_at, status')
      .in('application_id', appIds)
      .eq('status', 'success'),
    admin.from('jobs').select('loan_id, installer_name').in('loan_id', ids),
    admin.from('funders').select('id, name'),
  ])
  const appOf = new Map((apps.data ?? []).map((a) => [a.id, a]))
  const funderName = new Map((funders.data ?? []).map((f) => [f.id, f.name]))
  const installerOf = new Map((jobs.data ?? []).map((j) => [j.loan_id, j.installer_name]))

  return real.map((l) => {
    const app = appOf.get(l.application_id)
    const p = (app?.personal ?? {}) as { firstName?: string; surname?: string; state?: string }
    const snap = (l.profit_snapshot ?? {}) as ApprovedSnapshot
    const profit = snap.profit
    return {
      id: l.id,
      consumerId: l.consumer_id,
      customer: [p.firstName, p.surname].filter(Boolean).join(' ') || 'Customer',
      status: l.status,
      funderId: l.funder_id,
      funderName: l.funder_id ? (funderName.get(l.funder_id) ?? snap.funderName ?? null) : null,
      state: p.state ?? null,
      tenure: l.tenure,
      depositShare: Number(l.system_price) > 0 ? Number(l.deposit) / Number(l.system_price) : 0,
      applicantType: app?.applicant_type ?? 'individual',
      installer: installerOf.get(l.id) ?? null,
      systemPrice: Number(l.system_price),
      deposit: Number(l.deposit),
      balance: Number(l.balance),
      startDate: l.start_date,
      netProfit: profit?.netProfit ?? 0,
      netPerMonth: profit?.netPerMonth ?? 0,
      drawn: Number(l.drawn ?? profit?.drawn ?? 0),
      funderInterest: profit?.funderInterest ?? 0,
      funderMonthly: profit?.funderMonthly ?? 0,
      annualReturn: profit?.annualReturnOnDrawn ?? null,
      schedule: (schedule.data ?? [])
        .filter((r) => r.loan_id === l.id)
        .map((r) => ({
          n: r.n,
          dueDate: r.due_date,
          amount: Number(r.amount),
          paidAmount: Number(r.paid_amount),
          paidAt: r.paid_at,
        })),
      payments: (payments.data ?? [])
        .filter((pay) => pay.application_id === l.application_id && pay.paid_at)
        .map((pay) => ({ kind: pay.kind, amount: Number(pay.amount), paidAt: pay.paid_at! })),
    }
  })
}

/** Overheads to date: each month's fixed amount + per-system amount × systems started that month. */
export async function overheadsToDate(
  loans: LoanFacts[],
  now = new Date(),
): Promise<{ total: number; sample: boolean }> {
  const { data } = await createAdminClient()
    .from('overheads')
    .select('*')
    .lte('month', now.toISOString().slice(0, 10))
  let total = 0
  for (const o of data ?? []) {
    const m = o.month.slice(0, 7)
    const started = loans.filter((l) => l.startDate?.slice(0, 7) === m).length
    total += Number(o.fixed_amount) + Number(o.per_system_amount) * started
  }
  return { total, sample: (data ?? []).some((o) => o.sample) }
}

export function applyFilters<T extends LoanFacts>(loans: T[], f: ProfitFilters): T[] {
  return loans.filter(
    (l) =>
      (!f.funder || l.funderId === f.funder) &&
      (!f.state || l.state === f.state) &&
      (!f.tenure || String(l.tenure) === f.tenure) &&
      (!f.band || depositBand(l.depositShare) === f.band) &&
      (!f.type || l.applicantType === f.type) &&
      (!f.installer || l.installer === f.installer),
  )
}

/** Everything on /admin/profit. */
export async function profitDashboard(filters: ProfitFilters, now = new Date()) {
  const admin = createAdminClient()
  const all = await loadLoanFacts(filters.includeTest)
  const loans = applyFilters(all, filters)
  const [costs, overheads, fundersRes] = await Promise.all([
    unitCostsRow(),
    overheadsToDate(loans, now),
    admin.from('funders').select('id, name, balance_available, status, is_test').order('name'),
  ])
  const p = portfolio(loans, {
    now,
    overheadsToDate: overheads.total,
    lossProvisionShare: costs.lossProvisionShare,
  })
  // CO₂ avoided all time: an installed (active / completed) system avoids its plan's CO₂ each year.
  const { data: quotes } = await admin
    .from('loans')
    .select('id, start_date, status, quote_id, quotes(energy, plan)')
    .in(
      'id',
      loans
        .filter((l) => l.startDate)
        .map((l) => l.id)
        .concat(['00000000-0000-0000-0000-000000000000']),
    )
  let co2Tonnes = 0
  for (const q of quotes ?? []) {
    const quote = q.quotes as unknown as {
      energy: { current?: { fuelCo2KgPerYear?: number; gridCo2KgPerYear?: number } } | null
      plan: string
    } | null
    const cur = quote?.energy?.current
    if (!cur || !q.start_date) continue
    const kgPerYear =
      (cur.fuelCo2KgPerYear ?? 0) +
      (quote.plan === 'independence' ? (cur.gridCo2KgPerYear ?? 0) : 0)
    const years = Math.max(
      0,
      (now.getTime() - Date.parse(`${q.start_date}T12:00:00+01:00`)) / (365.25 * 86_400_000),
    )
    co2Tonnes += (kgPerYear * years) / 1000
  }
  const byId = new Map(p.customers.map((c) => [c.loanId, c]))
  return {
    portfolio: p,
    rows: loans.map((l) => ({ ...l, profit: byId.get(l.id)! })),
    co2Tonnes,
    overheadsSample: overheads.sample,
    funderBalances: (fundersRes.data ?? [])
      .filter((f) => f.status === 'active' && (filters.includeTest || !f.is_test))
      .map((f) => ({ id: f.id, name: f.name, balance: Number(f.balance_available) })),
    options: {
      funders: [
        ...new Map(
          all.filter((l) => l.funderId).map((l) => [l.funderId!, l.funderName ?? 'Funder']),
        ).entries(),
      ],
      states: [...new Set(all.map((l) => l.state).filter((s): s is string => Boolean(s)))].sort(),
      installers: [
        ...new Set(all.map((l) => l.installer).filter((s): s is string => Boolean(s))),
      ].sort(),
    },
  }
}

// ------------------------------------------------------------ snapshots (cron)
const monthStart = (now: Date) => {
  const lagos = new Date(now.getTime() + 3_600_000)
  return `${lagos.toISOString().slice(0, 7)}-01`
}

/**
 * Quoted (default funder, at quote time), Approved (the stored approval snapshot) once per loan,
 * and Actual for this month from real payments and recorded fees. Safe to run any number of times.
 */
export async function recordProfitSnapshots(
  now = new Date(),
): Promise<{ loans: number; written: number }> {
  const admin = createAdminClient()
  const facts = await loadLoanFacts(true)
  if (!facts.length) return { loans: 0, written: 0 }
  const costs = await unitCostsRow()
  const p = portfolio(facts, {
    now,
    overheadsToDate: 0,
    lossProvisionShare: costs.lossProvisionShare,
  })
  const byId = new Map(p.customers.map((c) => [c.loanId, c]))
  const [{ data: loans }, { data: defaultFunder }, { data: fees }] = await Promise.all([
    admin
      .from('loans')
      .select('id, application_id, quote_id, profit_snapshot')
      .in(
        'id',
        facts.map((f) => f.id),
      ),
    admin
      .from('funders')
      .select('id, name, annual_rate')
      .eq('status', 'active')
      .eq('is_test', false)
      .order('created_at')
      .limit(1)
      .maybeSingle(),
    admin.from('payments').select('application_id, fee').eq('status', 'success'),
  ])
  const quoteIds = (loans ?? []).map((l) => l.quote_id).filter((x): x is string => Boolean(x))
  const { data: quotes } = await admin
    .from('quotes')
    .select('id, result, tenure')
    .in('id', quoteIds.length ? quoteIds : ['00000000-0000-0000-0000-000000000000'])
  const quoteOf = new Map((quotes ?? []).map((q) => [q.id, q]))
  const feesOf = new Map<string, number>()
  for (const f of fees ?? [])
    feesOf.set(f.application_id ?? '', (feesOf.get(f.application_id ?? '') ?? 0) + Number(f.fee))

  const rows: {
    loan_id: string
    stage: 'quoted' | 'approved' | 'actual'
    month: string | null
    data: Json
  }[] = []
  for (const l of loans ?? []) {
    const q = l.quote_id ? quoteOf.get(l.quote_id) : null
    if (q && q.tenure && defaultFunder) {
      const r = q.result as unknown as QuoteResult
      rows.push({
        loan_id: l.id,
        stage: 'quoted',
        month: null,
        data: {
          funderName: defaultFunder.name,
          profit: loanProfit({
            systemPrice: r.systemPrice,
            costPrice: r.costPrice,
            deposit: r.deposit,
            tenureMonths: q.tenure as 3 | 6 | 9 | 12,
            funderAnnualRate: Number(defaultFunder.annual_rate),
            funderMethod: 'flat',
            unitCosts: costs,
          }),
        } as unknown as Json,
      })
    }
    if (l.profit_snapshot)
      rows.push({ loan_id: l.id, stage: 'approved', month: null, data: l.profit_snapshot })
    const c = byId.get(l.id)
    if (c) {
      rows.push({
        loan_id: l.id,
        stage: 'actual',
        month: monthStart(now),
        data: {
          ...c,
          recordedFees: feesOf.get(l.application_id) ?? 0,
          at: now.toISOString(),
        } as unknown as Json,
      })
    }
  }
  let written = 0
  for (const row of rows) {
    // Quoted / Approved once; Actual replaced within the month (latest run wins).
    const existing = admin
      .from('loan_profit_snapshots')
      .select('id')
      .eq('loan_id', row.loan_id)
      .eq('stage', row.stage)
    const { data: found } = await (
      row.month ? existing.eq('month', row.month) : existing.is('month', null)
    ).maybeSingle()
    if (found && row.stage !== 'actual') continue
    if (found)
      await admin.from('loan_profit_snapshots').update({ data: row.data }).eq('id', found.id)
    else await admin.from('loan_profit_snapshots').insert(row)
    written++
  }
  return { loans: (loans ?? []).length, written }
}
