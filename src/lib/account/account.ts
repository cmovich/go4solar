import { z } from 'zod'

import { formatNaira, normalisePhoneNG } from '@/lib/money'

/** Pure helpers for the customer's "My account" page (/app). */

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  })

export type NextInput = {
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'declined' | 'more_info'
  reviewed: boolean
  consumerSigned: boolean
  guarantorSigned: boolean
  guarantorName: string | null
  depositPaid: boolean
  loanStatus: string | null
  job: { installer: string; date: string | null; status: string } | null
  nextDue: { amount: number; dueDate: string } | null
}

/** "What happens next", in one plain sentence, from where the customer is now. */
export function whatHappensNext(i: NextInput): string {
  if (i.status === 'declined') {
    return 'We could not approve your application this time. Your deposit is refunded to you; call us if you have questions.'
  }
  if (i.status === 'more_info') {
    return 'We need a little more information before we can decide. See the message below.'
  }
  if (i.loanStatus === 'completed') return 'Your system is fully paid. Thank you!'
  if (i.loanStatus === 'active') {
    return i.nextDue
      ? `Your next payment of ${formatNaira(i.nextDue.amount)} is due on ${fmtDate(i.nextDue.dueDate)}.`
      : 'All payments so far are made. Thank you!'
  }
  if (i.status === 'approved') {
    if (i.job?.status === 'installed' || i.job?.status === 'commissioned') {
      return 'Your system is installed. Check that it works, then confirm below: payments start one month later.'
    }
    if (i.job?.date) return `${i.job.installer} will install your system on ${fmtDate(i.job.date)}.`
    if (i.job) return `${i.job.installer} will call you to agree an installation date.`
    return 'Approved! We are booking an installer near you and will tell you the date.'
  }
  if (i.status === 'submitted' || i.status === 'under_review') {
    return 'We are reviewing your application and will reply within 48 hours.'
  }
  // Draft: finish the steps in order.
  if (!i.reviewed) return 'Finish your application: a few more steps and you are done.'
  if (!i.consumerSigned) return 'Read and sign your payment plan agreement.'
  if (!i.guarantorSigned) {
    return `We are waiting for your guarantor${i.guarantorName ? `, ${i.guarantorName},` : ''} to sign. We have sent them a link.`
  }
  if (!i.depositPaid) return 'Pay your deposit to send your application for review.'
  return 'We are reviewing your application and will reply within 48 hours.'
}

type Row = {
  n: number
  dueDate: string
  amount: number
  paidAmount: number
  status: 'due' | 'paid' | 'late'
}

/** The first month not fully paid, and what is still owed on it (null when all are paid). */
export function nextPayment(
  schedule: Row[],
): { n: number; dueDate: string; amount: number; late: boolean } | null {
  const r = schedule.find((s) => s.paidAmount < s.amount)
  return r
    ? { n: r.n, dueDate: r.dueDate, amount: r.amount - r.paidAmount, late: r.status === 'late' }
    : null
}

/** Everything still to pay; before the schedule exists, the financed balance. */
export function amountLeft(schedule: Row[], financedBalance: number): number {
  if (schedule.length === 0) return financedBalance
  return schedule.reduce((s, r) => s + Math.max(0, r.amount - r.paidAmount), 0)
}

export type Address = { line1: string; city: string; lga: string; state: string }

export function formatAddress(a: Partial<Address> | null | undefined): string | null {
  if (!a?.line1) return null
  return [a.line1, a.city, a.lga ? `${a.lga} LGA` : null, a.state].filter(Boolean).join(', ')
}

export const CHANGE_FIELDS = ['name', 'phone', 'email', 'address'] as const
export type ChangeField = (typeof CHANGE_FIELDS)[number]
export const CHANGE_FIELD_LABELS: Record<ChangeField, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  address: 'Installation address',
}

/** "Request a change": the detail and its new value (phones in E.164). */
export const changeRequestSchema = z
  .object({
    field: z.enum(CHANGE_FIELDS),
    newValue: z.string().trim().min(2, 'Enter the new value').max(300),
    reason: z.string().trim().max(300).optional(),
  })
  .transform((v, ctx) => {
    if (v.field === 'phone') {
      try {
        return { ...v, newValue: normalisePhoneNG(v.newValue) }
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a Nigerian mobile number',
          path: ['newValue'],
        })
        return z.NEVER
      }
    }
    if (v.field === 'email' && !z.email().safeParse(v.newValue).success) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email address', path: ['newValue'] })
      return z.NEVER
    }
    return v
  })
