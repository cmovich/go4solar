import type { ExportBatch } from './exports'
import type { FunderBatchView } from './server'

/** A funder batch view as the export input (decisions by customer reference). */
export function exportOf(b: FunderBatchView): ExportBatch {
  return {
    number: b.number,
    version: b.version,
    lendingType: b.lendingType,
    createdAt: b.createdAt,
    totals: b.totals,
    customers: b.items.map((i) => i.customer),
    decisions: Object.fromEntries(
      b.items.map((i) => [i.customer.reference, { decision: i.decision, note: i.note }]),
    ),
  }
}
