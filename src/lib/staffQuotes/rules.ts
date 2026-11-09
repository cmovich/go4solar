import { z } from 'zod'

import { isStaffRole, type AppRole } from '@/lib/auth/staffRoles'
import { lagosDayRange } from '@/lib/grid/insights'
import { formatNaira } from '@/lib/money'
import { NG_STATE_IDS, type NgStateId } from '@/lib/nigeria/states'
import { phoneSchema } from '@/lib/waitlist/schema'

/**
 * Staff quotation tool: who may use it, the optional customer fields, status, the WhatsApp
 * message and the list filters. Pure.
 */

/** Super admins always; other staff only with the create_quotations permission. */
export function canCreateQuotations(role: AppRole | null | undefined, hasPermission: boolean) {
  if (role === 'super_admin') return true
  return isStaffRole(role) && hasPermission
}

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

/** The optional customer details at the top (the state is needed for prices and sun hours). */
export const customerSchema = z.object({
  name: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .min(2, 'Enter at least 2 letters, or leave the name blank')
      .max(120)
      .nullable(),
  ),
  phone: z.preprocess(blankToNull, phoneSchema.nullable()),
  state: z.enum(NG_STATE_IDS as [NgStateId, ...NgStateId[]], {
    error: "Choose the customer's state",
  }),
})
export type QuotationCustomer = z.infer<typeof customerSchema>

export type QuotationStatus = 'created' | 'shared' | 'accepted' | 'expired'
export const STATUS_LABELS: Record<QuotationStatus, string> = {
  created: 'Not shared yet',
  shared: 'Shared',
  accepted: 'Accepted',
  expired: 'Expired',
}

export function quotationStatus(
  q: { accepted_at: string | null; shared_at: string | null; valid_until: string },
  now: Date = new Date(),
): QuotationStatus {
  if (q.accepted_at) return 'accepted'
  if (new Date(q.valid_until) < now) return 'expired'
  return q.shared_at ? 'shared' : 'created'
}

/** The WhatsApp message staff send with the link (no amounts while prices are SAMPLE). */
export function shareMessage(m: {
  customerName: string | null
  reference: string
  total: number
  deposit: number
  monthly: number
  months: number
  sample: boolean
  link: string
}): string {
  const first = m.customerName?.trim().split(/\s+/)[0]
  const hello = first ? `Hello ${first}` : 'Hello'
  const lines = [`${hello}, here is your Go4Solar quotation ${m.reference}.`]
  if (m.sample) {
    lines.push('Your exact price will be confirmed when we contact you.')
  } else {
    lines.push(`Total amount payable: ${formatNaira(m.total)}`)
    lines.push(
      `Deposit: ${formatNaira(m.deposit)}, then ${formatNaira(m.monthly)} a month for ${m.months} months.`,
    )
  }
  lines.push(`View it and tap "Accept and apply" to start: ${m.link}`)
  return lines.join('\n')
}

/** wa.me link: straight to the customer's chat when the phone is known, else any chat. */
export function shareHref(phoneE164: string | null, text: string): string {
  const digits = phoneE164 ? phoneE164.replace(/\D/g, '') : ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/** Test data: made by a test staff account, or for a test phone number (+234800000…). */
export function isTestQuotation(creatorIsTest: boolean, phoneE164: string | null): boolean {
  return creatorIsTest || Boolean(phoneE164?.startsWith('+234800000'))
}

const UUID = z.uuid()

/** /admin/quotations filters from the address bar. */
export function listFilters(sp: { staff?: string; from?: string; to?: string; test?: string }) {
  const days = lagosDayRange(sp.from, sp.to)
  return {
    staff: sp.staff && UUID.safeParse(sp.staff).success ? sp.staff : null,
    from: days.from,
    to: days.to,
    test: sp.test === '1',
  }
}
