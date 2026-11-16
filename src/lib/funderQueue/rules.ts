import { z } from 'zod'

import { FUNDER_APPROVER_ROLE } from '@/lib/auth/staffRoles'
import { lockStatus } from '@/lib/payments/lock'

/**
 * Funder routing (pure). Business applicants with a deposit of 30% or more go, once the deposit
 * is paid, to SPEWA's approval queue instead of the general one (settings.funder_routing).
 */
export type Routing = {
  /** The funder whose queue gets these files (null: nothing is routed). */
  funderId: string | null
  minDepositShare: number
  applicantTypes: string[]
}

/** A funder's decision on a file in its queue. */
export type QueueDecision = 'pending' | 'approved' | 'declined'

export const DEFAULT_ROUTING: Routing = {
  funderId: null,
  minDepositShare: 0.3,
  applicantTypes: ['business'],
}

const uuid = z.string().uuid()

/** The setting, field by field; a field that is missing or wrong takes the default. */
export function routingFromSetting(value: unknown): Routing {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const funder = uuid.safeParse(v.funderId)
  const share = z.number().gt(0).lte(1).safeParse(v.minDepositShare)
  const types = z.array(z.string()).min(1).safeParse(v.applicantTypes)
  return {
    funderId: funder.success ? funder.data : DEFAULT_ROUTING.funderId,
    minDepositShare: share.success ? share.data : DEFAULT_ROUTING.minDepositShare,
    applicantTypes: types.success ? types.data : DEFAULT_ROUTING.applicantTypes,
  }
}

/** The funder whose queue this application goes to, or null for the general queue. */
export function routeTo(
  input: { applicantType: string; depositShare: number },
  routing: Routing,
): string | null {
  if (!routing.funderId) return null
  if (!routing.applicantTypes.includes(input.applicantType)) return null
  // A stored share like 0.29999999 is still 30%.
  return input.depositShare + 1e-6 >= routing.minDepositShare ? routing.funderId : null
}

/** The deposit share the customer chose (quote snapshot), else deposit ÷ price. */
export function depositShareOf(q: {
  deposit: number
  systemPrice: number
  snapshot: { depositShare?: number } | null | undefined
}): number {
  const s = q.snapshot?.depositShare
  if (typeof s === 'number' && Number.isFinite(s)) return s
  return q.systemPrice > 0 ? q.deposit / q.systemPrice : 0
}

export { FUNDER_APPROVER_ROLE }

/** Sees the SPEWA queue and its files. */
export const canViewFunderQueue = (role: string | null | undefined) =>
  role === 'super_admin' || role === 'credit_officer' || role === FUNDER_APPROVER_ROLE

/** Approves or declines files in the SPEWA queue. */
export const canDecideFunderQueue = (role: string | null | undefined) =>
  role === 'super_admin' || role === FUNDER_APPROVER_ROLE

/** Records the post-dated cheques note (our staff; cheques arrive by hand). */
export const canRecordCheques = (role: string | null | undefined) =>
  role === 'super_admin' || role === 'credit_officer'

/** The cheques note: "yes" needs a number (1–120) and the date received (not in the future). */
export function chequesSchema(today: string) {
  return z
    .object({
      received: z.enum(['yes', 'no']),
      count: z.string().trim().optional(),
      receivedOn: z.string().trim().optional(),
    })
    .transform((v, ctx) => {
      if (v.received === 'no') return { received: false, count: null, receivedOn: null }
      const count = Number(v.count)
      if (!v.count || !Number.isInteger(count) || count < 1 || count > 120) {
        ctx.addIssue({
          code: 'custom',
          path: ['count'],
          message: 'Enter the number of cheques (1–120).',
        })
        return z.NEVER
      }
      if (!v.receivedOn || !/^\d{4}-\d{2}-\d{2}$/.test(v.receivedOn)) {
        ctx.addIssue({ code: 'custom', path: ['receivedOn'], message: 'Enter the date received.' })
        return z.NEVER
      }
      if (v.receivedOn > today) {
        ctx.addIssue({
          code: 'custom',
          path: ['receivedOn'],
          message: 'The date received cannot be in the future.',
        })
        return z.NEVER
      }
      return { received: true, count, receivedOn: v.receivedOn }
    })
}

/** One decision for one or more files (bulk: at most 50 at once). */
export const queueDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), ids: z.array(uuid).min(1).max(50) }),
  z.object({
    decision: z.literal('decline'),
    ids: z.array(uuid).min(1).max(50),
    reason: z.string().trim().min(3, 'Give a reason.').max(1000),
  }),
])

export type ScheduleRow = { dueDate: string; amount: number; paidAmount: number }

export type RepaymentSummary = {
  months: number
  paidMonths: number
  paid: number
  outstanding: number
  /** Unpaid on months already due. */
  overdue: number
  daysOverdue: number
  /** The oldest month not fully paid. */
  nextDue: string | null
}

/** Where a plan's repayments stand today (Lagos date). */
export function repaymentSummary(schedule: ScheduleRow[], today: string): RepaymentSummary {
  const rows = [...schedule].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const paid = rows.reduce((s, r) => s + Math.min(r.paidAmount, r.amount), 0)
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const overdue = rows
    .filter((r) => r.dueDate < today)
    .reduce((s, r) => s + Math.max(0, r.amount - r.paidAmount), 0)
  const { daysOverdue } = lockStatus({
    schedule: rows,
    today,
    lockAfterDays: 0,
    extensionUntil: null,
    active: false,
  })
  return {
    months: rows.length,
    paidMonths: rows.filter((r) => r.paidAmount >= r.amount).length,
    paid,
    outstanding: total - paid,
    overdue,
    daysOverdue,
    nextDue: rows.find((r) => r.paidAmount < r.amount)?.dueDate ?? null,
  }
}
