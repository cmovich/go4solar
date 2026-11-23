import type { InvoiceData } from './build'

export type InvoiceFinancing = {
  /** Price − deposit (before the payment plan charge). */
  financed: number
  chargeLabel: string
  charge: number
  /** Financed + charge: what the monthly payments add up to. */
  balance: number
}

/**
 * SPEWA offer quotations and invoices (pure): the amount financed, the payment plan charge and
 * the balance to repay monthly, read from the document's own lines and totals, so documents
 * stored before this change show them too. Null when there is no separate charge (home quotes:
 * the cost is in the one fixed price) or nothing is paid monthly (paid in full).
 */
export function invoiceFinancing(
  d: Pick<InvoiceData, 'lines' | 'totals'>,
): InvoiceFinancing | null {
  const charges = d.lines.filter((l) => l.kind === 'charge')
  const charge = charges.reduce((s, l) => s + l.amount, 0)
  if (charge <= 0 || d.totals.months <= 0 || d.totals.balance <= 0) return null
  return {
    financed: d.totals.balance - charge,
    chargeLabel: charges[0]!.item,
    charge,
    balance: d.totals.balance,
  }
}
