import { invoiceDay } from './dates'

export type VerifyView =
  | {
      status: 'genuine'
      number: string
      firstName: string | null
      total: number
      issuedOn: string
      validUntil: string
      expired: boolean
    }
  | { status: 'not_found' }

type InvoiceRow = {
  number: string
  first_name: string | null
  total: number | string
  issued_at: string
  valid_until: string
}

/**
 * The public verify page (/verify/<code>): whether the invoice is genuine, its number, date and
 * total, and the customer's first name only. Pure.
 */
export function verifyView(row: InvoiceRow | null, now = new Date()): VerifyView {
  if (!row) return { status: 'not_found' }
  return {
    status: 'genuine',
    number: row.number,
    firstName: row.first_name,
    total: Number(row.total),
    issuedOn: invoiceDay(row.issued_at),
    validUntil: invoiceDay(row.valid_until),
    expired: new Date(row.valid_until).getTime() < now.getTime(),
  }
}
