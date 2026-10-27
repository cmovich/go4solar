import { createHash } from 'node:crypto'

import { formatNaira, formatPercent } from '@/lib/money'
import type { QuoteResult } from '@/lib/pricing/types'
import type { SystemSize } from '@/lib/sizing/types'

export type AgreementValues = Record<string, string>

/**
 * The values printed in an agreement. Every amount comes from the stored quote (its snapshot),
 * never from today's settings. Consumer wording: payment plan, total amount payable, no interest.
 */
export function agreementValues(input: {
  reference: string
  date: Date
  quote: QuoteResult
  tenure: number
  size: SystemSize
  customerName: string
  business: { rcNumber?: string } | null
  signerName: string
  signerTitle: string | null
  address: string
  lateFeeDaily: number
  lateFeeCap: number
  /** Days overdue before the system may be locked (setting lock_after_days_overdue). */
  lockAfterDays: number
  guarantorName?: string
}): AgreementValues {
  const q = input.quote
  const n = q.instalments.length
  const last = q.instalments[n - 1] ?? q.monthly
  return {
    reference: input.reference,
    date: input.date.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'long' }),
    customerName: input.customerName,
    businessClause: input.business
      ? `, a business registered with the Corporate Affairs Commission${input.business.rcNumber ? ` (${input.business.rcNumber})` : ''}, acting through its director or authorised signatory`
      : '',
    address: input.address,
    systemDescription:
      `a ${input.size.inverterKva} kVA inverter, ${input.size.batteryKwh} kWh of lithium battery storage, ${input.size.panelCount} solar panels (${input.size.panelKw} kW), protection, cables and mounting, and installation` +
      // Part B "allow round-down": the agreement states the shortfall.
      (input.size.shortfall
        ? `. The battery is smaller than this plan calls for: expect about ${input.size.shortfall.hours} hours less backup than planned.`
        : ''),
    totalPayable: formatNaira(q.systemPrice),
    deposit: formatNaira(q.deposit),
    depositPct: formatPercent(q.snapshot.depositShare),
    instalmentCount: String(n),
    monthly: formatNaira(q.monthly),
    lastInstalmentNote: last !== q.monthly ? ` (the last payment is ${formatNaira(last)})` : '',
    tenure: String(input.tenure),
    lateFeeDaily: formatPercent(input.lateFeeDaily, 2).replace(/\.?0+%$/, '%'),
    lateFeeCap: formatPercent(input.lateFeeCap),
    lockAfterDays: String(input.lockAfterDays),
    signerName: input.signerName,
    signerTitleLine: input.signerTitle
      ? `, ${input.signerTitle}, for and on behalf of ${input.customerName}`
      : '',
    guarantorName: input.guarantorName ?? '',
  }
}

/** Replace {{key}} placeholders; unknown keys render as empty text. */
export function renderTemplate(body: string, values: AgreementValues): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Fingerprint of what was signed: the agreement text, the signature image and the audit details.
 * Printed on the audit page. (The hash of the final PDF file cannot be printed inside that same
 * file, so it is stored on the agreement row as pdf_sha256.)
 */
export function contentFingerprint(
  text: string,
  signaturePng: Buffer,
  audit: Record<string, string>,
): string {
  const h = createHash('sha256')
  h.update(text)
  h.update('\u0000')
  h.update(signaturePng)
  h.update('\u0000')
  h.update(
    JSON.stringify(
      Object.keys(audit)
        .sort()
        .map((k) => [k, audit[k]]),
    ),
  )
  return h.digest('hex')
}

/** A template carries "DRAFT — lawyer review required" until a super admin approves that version. */
export function templateBody(t: { body_md: string; status: 'draft' | 'approved' }): string {
  if (t.status !== 'approved') return t.body_md
  return t.body_md
    .split('\n')
    .filter((line) => !line.includes('DRAFT — lawyer review required'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}
