import { latestStatus, type CheckSummary } from '@/lib/applications/rules'
import { formatNaira } from '@/lib/money'
import { buildSchedule } from '@/lib/payments/schedule'
import type { TenureMonths } from '@/lib/pricing/types'
import { loanProfit } from '@/lib/profit/loanProfit'
import { tradeLendaDrawn } from '@/lib/tradeLenda/figures'
import type { LoanProfit, UnitCosts } from '@/lib/profit/types'

export type LoanFigures = {
  systemPrice: number
  costPrice: number
  deposit: number
  /** What the customer still owes after the deposit (the amount financed). */
  balance: number
  tenure: TenureMonths
  /**
   * The price paid in full (no payment-plan cost): what a funder that lends to the customer pays
   * Go4Solar upfront. Missing: the system price is used.
   */
  priceInFull?: number
}

export type FunderRow = {
  id: string
  name: string
  annualRate: number
  minAmount: number
  maxAmount: number | null
  maxTenure: number
  balanceAvailable: number
  status: 'active' | 'paused'
  /**
   * Who the funder lends to (0041). Only a funder that can lend to CUSTOMERS uses the lending-type
   * rules (one option per type); every other funder keeps the old way (drawn = cost − deposit).
   */
  lendingTypes?: ('customer' | 'go4solar')[]
}

/** Money drawn from a funder: cost price − deposit, never below 0. */
export const drawnFor = (l: LoanFigures) => Math.max(0, l.costPrice - l.deposit)

/** What a lending-type funder (Trade Lenda) hands over, either type: price paid in full − deposit. */
const drawnByLender = (l: LoanFigures) =>
  tradeLendaDrawn({ priceInFull: l.priceInFull ?? l.systemPrice, deposit: l.deposit })

/** Funders that can carry this loan: active, ticket size, tenure and balance all fit. */
export function eligibleFunders(funders: FunderRow[], l: LoanFigures): FunderRow[] {
  return funders.filter((f) => {
    // A lending-type funder's balance is reduced by price paid in full − deposit; every other
    // funder by cost − deposit.
    const drawn = f.lendingTypes?.includes('customer') ? drawnByLender(l) : drawnFor(l)
    return (
      f.status === 'active' &&
      l.tenure <= f.maxTenure &&
      f.balanceAvailable >= drawn &&
      (drawn === 0 || (drawn >= f.minAmount && (f.maxAmount === null || drawn <= f.maxAmount)))
    )
  })
}

/**
 * What comes off the funder's available balance at approval (and goes back if the loan is
 * cancelled). Trade Lenda, either lending type: price paid in full − deposit (the drawn amount).
 * Others: cost − deposit, as before.
 */
export function balanceDrawFor(o: Pick<FunderOption, 'lendingType'>, l: LoanFigures): number {
  return o.lendingType ? drawnByLender(l) : drawnFor(l)
}

export type FunderOption = {
  funder: FunderRow
  /** Set for funders that use lending types (Trade Lenda). */
  lendingType?: 'customer' | 'go4solar'
  profit: LoanProfit
  /** Net profit ÷ system price. */
  netShare: number
  loss: boolean
  belowMinimum: boolean
}

/**
 * Go4Solar's side of the loan with each funder (PRD "Approved" stage). Payment fees already paid
 * (e.g. the deposit's provider fee) are taken off as well as the per-instalment estimate.
 */
export function funderOptions(
  funders: FunderRow[],
  l: LoanFigures,
  unitCosts: UnitCosts,
  opts: { recordedFees: number; minNetMarginShare: number },
): FunderOption[] {
  type Variant = { funder: FunderRow; lendingType: 'customer' | 'go4solar' | undefined }
  const variants = funders.flatMap((funder): Variant[] =>
    funder.lendingTypes?.includes('customer')
      ? funder.lendingTypes.map((lendingType) => ({ funder, lendingType }))
      : [{ funder, lendingType: undefined }],
  )
  return variants.map(({ funder, lendingType }) => {
    const p = loanProfit({
      // Lent to the customer: Go4Solar receives the price paid in full upfront.
      systemPrice: lendingType === 'customer' ? (l.priceInFull ?? l.systemPrice) : l.systemPrice,
      costPrice: l.costPrice,
      deposit: l.deposit,
      tenureMonths: l.tenure,
      funderAnnualRate: funder.annualRate,
      funderMethod: 'flat',
      unitCosts,
      lendingType,
      drawnAmount: lendingType === 'go4solar' ? drawnByLender(l) : undefined,
    })
    const netProfit = p.netProfit - opts.recordedFees
    const profit: LoanProfit = {
      ...p,
      directCosts: p.directCosts + opts.recordedFees,
      netProfit,
      netPerMonth: Math.round(netProfit / l.tenure),
      annualReturnOnDrawn: p.drawn > 0 ? (netProfit / p.drawn) * (12 / l.tenure) : null,
    }
    const revenue = lendingType === 'customer' ? (l.priceInFull ?? l.systemPrice) : l.systemPrice
    const netShare = revenue > 0 ? netProfit / revenue : 0
    return {
      funder,
      ...(lendingType ? { lendingType } : {}),
      profit,
      netShare,
      loss: netProfit < 0,
      belowMinimum: netShare < opts.minNetMarginShare,
    }
  })
}

/** One option's key: the funder id, plus ":customer" / ":go4solar" for a lending-type funder. */
export const optionKey = (o: Pick<FunderOption, 'funder' | 'lendingType'>) =>
  o.lendingType ? `${o.funder.id}:${o.lendingType}` : o.funder.id

type RequiredKind = 'cac' | 'nin' | 'bvn' | 'liveness'
const CHECK_LABEL: Record<RequiredKind, string> = {
  cac: 'CAC',
  nin: 'NIN',
  bvn: 'BVN',
  liveness: 'Face',
}

/**
 * Everything that stops an approval (empty = can approve): deposit paid, customer and guarantor
 * signed, every KYC check passed (a check in manual review must be cleared by a credit officer).
 */
export function approvalBlockers(input: {
  status: string
  applicantType: 'individual' | 'business'
  depositPaid: boolean
  consumerSigned: boolean
  guarantorSigned: boolean
  checks: CheckSummary[]
  livenessDeferred: boolean
}): string[] {
  if (input.status !== 'submitted' && input.status !== 'under_review') {
    return [`Application is ${input.status.replace('_', ' ')}, not waiting for a decision`]
  }
  const out: string[] = []
  if (!input.depositPaid) out.push('Deposit not paid')
  if (!input.consumerSigned) out.push('Customer has not signed')
  if (!input.guarantorSigned) out.push('Guarantor has not signed')
  const kinds: RequiredKind[] = [
    ...(input.applicantType === 'business' ? (['cac'] as const) : []),
    'nin',
    'bvn',
    ...(input.livenessDeferred ? [] : (['liveness'] as const)),
  ]
  for (const kind of kinds) {
    const s = latestStatus(input.checks, kind)
    if (s === 'manual_review')
      out.push(`${CHECK_LABEL[kind]} check is in manual review: clear or fail it first`)
    else if (s !== 'passed') out.push(`${CHECK_LABEL[kind]} check not passed`)
  }
  return out
}

/**
 * Who may approve: a credit officer up to the limit (on the amount financed) and only at or above
 * the minimum net margin; a super admin always. Everyone else: no.
 */
export function approvalAuthority(input: {
  role: string | null
  amount: number
  limit: number
  netShare: number
  minNetMarginShare: number
}): { allowed: boolean; reasons: string[] } {
  if (input.role === 'super_admin') return { allowed: true, reasons: [] }
  if (input.role !== 'credit_officer')
    return { allowed: false, reasons: ['Only a credit officer or super admin can approve'] }
  const reasons: string[] = []
  if (input.amount > input.limit) {
    reasons.push(
      `Above the credit officer limit of ${formatNaira(input.limit)}: needs a super admin`,
    )
  }
  if (input.netShare < input.minNetMarginShare)
    reasons.push('Net margin below the minimum: needs a super admin')
  return { allowed: reasons.length === 0, reasons }
}

/** Separation of duties: whoever approved the loan cannot release the money for its job. */
export function canConfirmPayout(input: {
  actorId: string
  approvedBy: string | null
  jobStatus: string
}): { allowed: boolean; reason?: string } {
  if (input.jobStatus !== 'commissioned')
    return { allowed: false, reason: 'The job is not commissioned yet.' }
  if (input.approvedBy && input.actorId === input.approvedBy) {
    return {
      allowed: false,
      reason: 'You approved this loan, so someone else must confirm the payout.',
    }
  }
  return { allowed: true }
}

/** New due dates at commissioning: one month after the customer signs off, month-end safe. */
export function rebaseDueDates(count: number, signedOffAt: Date): string[] {
  return buildSchedule(Array<number>(count).fill(0), signedOffAt).map((r) => r.dueDate)
}

export const SLA_HOURS = 48

/** Hours left of the 48-hour decision target (negative = overdue). */
export function slaState(
  submittedAt: string | null,
  now = new Date(),
): { hoursLeft: number; overdue: boolean } | null {
  if (!submittedAt) return null
  const elapsed = (now.getTime() - new Date(submittedAt).getTime()) / 3_600_000
  const hoursLeft = Math.round(SLA_HOURS - elapsed)
  return { hoursLeft, overdue: elapsed > SLA_HOURS }
}
