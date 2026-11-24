import { LENDING_TYPE_SHORT, type LendingType } from './figures'
import type { ExportTotals } from '@/lib/exports/financing'

import type { FunderCustomer } from './snapshot'

/** Trade Lenda batches (pure): numbers, labels and the summary totals. */

export const batchNumber = (prefix: string, n: number) =>
  `${prefix}-Batch-${String(n).padStart(3, '0')}`

/** The next number for this funder: one more than the highest so far (TL-Batch-001 first). */
export function nextBatchNumber(prefix: string, existing: string[]): string {
  const max = existing.reduce((m, s) => {
    const n = Number(/-Batch-(\d+)$/.exec(s)?.[1] ?? 0)
    return Math.max(m, n)
  }, 0)
  return batchNumber(prefix, max + 1)
}

/** "TL-Batch-001 v2 · Lends to customers". */
export const batchLabel = (number: string, version: number, type: LendingType) =>
  `${number}${version > 1 ? ` v${version}` : ''} · ${LENDING_TYPE_SHORT[type]}`

type Group = {
  customers: number
  costToCustomers: number
  financed: number
  totalRepayments: number
}
export type BatchTotals = {
  lendingType: LendingType
  customers: number
  totalCostToCustomers: number
  totalDeposits: number
  totalFinanced: number
  totalRepayments: number
  monthlyRepaymentsDue: number
  byPlan: Record<string, Group>
  byMonths: Record<string, Group>
  /** Exports from 0043 on: levels, deposits and what the funder finances and earns. */
  financing?: ExportTotals
}

export function batchTotals(type: LendingType, items: FunderCustomer[]): BatchTotals {
  const empty = (): Group => ({ customers: 0, costToCustomers: 0, financed: 0, totalRepayments: 0 })
  const byPlan: Record<string, Group> = {}
  const byMonths: Record<string, Group> = {}
  const add = (g: Group, c: FunderCustomer) => {
    g.customers += 1
    g.costToCustomers += c.figures.costToCustomer
    g.financed += c.figures.financed
    g.totalRepayments += c.figures.totalRepayment
  }
  for (const c of items) {
    add((byPlan[c.plan.label] ??= empty()), c)
    add((byMonths[String(c.figures.months)] ??= empty()), c)
  }
  const sum = (f: (c: FunderCustomer) => number) => items.reduce((s, c) => s + f(c), 0)
  return {
    lendingType: type,
    customers: items.length,
    totalCostToCustomers: sum((c) => c.figures.costToCustomer),
    totalDeposits: sum((c) => c.figures.deposit),
    totalFinanced: sum((c) => c.figures.financed),
    totalRepayments: sum((c) => c.figures.totalRepayment),
    monthlyRepaymentsDue: sum((c) => c.figures.monthly),
    byPlan,
    byMonths,
  }
}
