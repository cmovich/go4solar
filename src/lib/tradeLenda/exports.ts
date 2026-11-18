import ExcelJS from 'exceljs'

import type { Company } from '@/lib/company/schema'
import { formatNaira, formatPercent } from '@/lib/money'

import { batchLabel, type BatchTotals } from './batch'
import { LENDING_TYPE_LABELS, type LendingType } from './figures'
import { EMPLOYMENT_LABELS } from './profile'
import type { FunderCustomer } from './snapshot'

/**
 * Trade Lenda downloads (CSV, Excel, PDF) for one customer or a whole batch. Built ONLY from the
 * funder-safe snapshot and batch totals, so nothing internal can appear in a file.
 */
export type ExportBatch = {
  number: string
  version: number
  lendingType: LendingType
  createdAt: string
  totals: BatchTotals
  customers: FunderCustomer[]
  /** The funder's decision per customer reference. */
  decisions: Record<string, { decision: string; note: string | null }>
}

const COLUMNS: [string, (c: FunderCustomer, b: ExportBatch) => string | number][] = [
  ['Batch', (_, b) => batchLabel(b.number, b.version, b.lendingType)],
  ['Lending type', (_, b) => LENDING_TYPE_LABELS[b.lendingType]],
  ['Reference', (c) => c.reference],
  ['Customer', (c) => c.name],
  ['Type', (c) => (c.applicantType === 'business' ? 'Business' : 'Individual')],
  ['Phone', (c) => c.phone],
  ['Email', (c) => c.email ?? ''],
  ['Date of birth', (c) => c.dateOfBirth ?? ''],
  ['Street', (c) => c.address.street ?? ''],
  ['Landmark', (c) => c.address.landmark ?? ''],
  ['LGA', (c) => c.address.lga ?? ''],
  ['State', (c) => c.address.state ?? ''],
  [
    'Work',
    (c) =>
      c.work.employmentType
        ? (EMPLOYMENT_LABELS[c.work.employmentType as keyof typeof EMPLOYMENT_LABELS] ??
          c.work.employmentType)
        : '',
  ],
  ['Employer', (c) => c.work.employer ?? ''],
  ['Monthly income', (c) => c.work.incomeRange ?? ''],
  ['NIN (last 4)', (c) => c.ninLast4 ?? ''],
  ['BVN (last 4)', (c) => c.bvnLast4 ?? ''],
  ['Guarantor', (c) => c.guarantor.name ?? ''],
  ['Guarantor phone', (c) => c.guarantor.phone ?? ''],
  ['Guarantor relationship', (c) => c.guarantor.relationship ?? ''],
  ['Plan', (c) => c.plan.label],
  [
    'Items',
    (c) => c.plan.items.map((i) => `${i.qty} × ${i.name}${i.spec ? ` ${i.spec}` : ''}`).join('; '),
  ],
  ['Total cost to customer', (c) => c.figures.costToCustomer],
  ['Deposit', (c) => c.figures.deposit],
  ['Deposit %', (c) => Math.round(c.figures.depositShare * 100)],
  ['Amount financed', (c) => c.figures.financed],
  ['Rate per month %', (c) => Math.round(c.figures.ratePerMonth * 10_000) / 100],
  ['Months', (c) => c.figures.months],
  ['Monthly repayment', (c) => c.figures.monthly],
  ['Total repayment', (c) => c.figures.totalRepayment],
  ['Verified by phone', (c) => `${c.records.verifiedByPhone.by}, ${c.records.verifiedByPhone.at}`],
  ['Consent to share', (c) => `${c.records.consent.by}, ${c.records.consent.at}`],
  ['Figures agreed', (c) => `${c.records.figuresAgreed.by}, ${c.records.figuresAgreed.at}`],
  ['Decision', (c, b) => b.decisions[c.reference]?.decision ?? 'pending'],
  ['Decision note', (c, b) => b.decisions[c.reference]?.note ?? ''],
]

const cell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function batchCsv(b: ExportBatch): string {
  const head = COLUMNS.map(([h]) => cell(h)).join(',')
  const rows = b.customers.map((c) => COLUMNS.map(([, f]) => cell(f(c, b))).join(','))
  return [head, ...rows].join('\n') + '\n'
}

/** The batch summary as label/value rows (first sheet and first PDF page). */
export function summaryRows(b: ExportBatch): [string, string][] {
  const t = b.totals
  return [
    ['Batch', batchLabel(b.number, b.version, b.lendingType)],
    ['Lending type', LENDING_TYPE_LABELS[b.lendingType]],
    ['Date sent', b.createdAt.slice(0, 10)],
    ['Customers', String(t.customers)],
    ['Total cost to customers', formatNaira(t.totalCostToCustomers)],
    ['Total deposits', formatNaira(t.totalDeposits)],
    ['Total financed', formatNaira(t.totalFinanced)],
    ['Total repayments', formatNaira(t.totalRepayments)],
    ['Monthly repayments due', formatNaira(t.monthlyRepaymentsDue)],
    ...Object.entries(t.byPlan).map(
      ([plan, g]) =>
        [`Plan: ${plan}`, `${g.customers} · financed ${formatNaira(g.financed)}`] as [
          string,
          string,
        ],
    ),
    ...Object.entries(t.byMonths).map(
      ([m, g]) =>
        [`${m} months`, `${g.customers} · financed ${formatNaira(g.financed)}`] as [string, string],
    ),
  ]
}

export async function batchXlsx(b: ExportBatch, company: Company): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = company.name
  const sum = wb.addWorksheet('Summary')
  sum.addRow([company.name])
  sum.addRow([`${company.address} · ${company.phone} · ${company.email}`])
  sum.addRow([])
  for (const [k, v] of summaryRows(b)) sum.addRow([k, v])
  sum.getColumn(1).width = 34
  sum.getColumn(2).width = 44
  const sheet = wb.addWorksheet('Customers')
  sheet.addRow(COLUMNS.map(([h]) => h))
  for (const c of b.customers) sheet.addRow(COLUMNS.map(([, f]) => f(c, b)))
  sheet.getRow(1).font = { bold: true }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}

/** One customer's details as label/value rows (the PDF's customer pages). */
export function customerRows(c: FunderCustomer): [string, string][] {
  const f = c.figures
  return [
    ['Reference', c.reference],
    ['Customer', `${c.name} (${c.applicantType === 'business' ? 'business' : 'individual'})`],
    ['Phone', [c.phone, c.whatsapp ? `WhatsApp ${c.whatsapp}` : ''].filter(Boolean).join(' · ')],
    ['Email', c.email ?? '—'],
    ['Date of birth', c.dateOfBirth ?? '—'],
    [
      'Address',
      [c.address.street, c.address.landmark, c.address.lga, c.address.state]
        .filter(Boolean)
        .join(', '),
    ],
    [
      'Work',
      [c.work.employmentType, c.work.employer, c.work.jobTitle].filter(Boolean).join(' · ') || '—',
    ],
    ['Monthly income', c.work.incomeRange ?? '—'],
    ['NIN / BVN (last 4)', `${c.ninLast4 ?? '—'} / ${c.bvnLast4 ?? '—'}`],
    [
      'Guarantor',
      [c.guarantor.name, c.guarantor.relationship, c.guarantor.phone].filter(Boolean).join(' · ') ||
        '—',
    ],
    ['Plan', c.plan.label],
    [
      'Items',
      c.plan.items.map((i) => `${i.qty} × ${i.name}${i.spec ? ` ${i.spec}` : ''}`).join('; '),
    ],
    ['Total cost to customer', formatNaira(f.costToCustomer)],
    ['Deposit', `${formatNaira(f.deposit)} (${formatPercent(f.depositShare)})`],
    ['Amount financed', formatNaira(f.financed)],
    ['Rate', `${formatPercent(f.ratePerMonth, 1)} per month, flat`],
    ['Months', String(f.months)],
    ['Monthly repayment', formatNaira(f.monthly)],
    ['Total repayment', formatNaira(f.totalRepayment)],
    ...(f.customerTotalPayable !== null
      ? ([['Customer pays Go4Solar', `${formatNaira(f.customerTotalPayable)} in all`]] as [
          string,
          string,
        ][])
      : []),
    ['Verified by phone', `${c.records.verifiedByPhone.by}, ${c.records.verifiedByPhone.at}`],
    ['Consent to share', `${c.records.consent.by}, ${c.records.consent.at}`],
    ['Figures agreed', `${c.records.figuresAgreed.by}, ${c.records.figuresAgreed.at}`],
  ]
}

/** A batch narrowed to one customer (same file formats). */
export function oneCustomer(b: ExportBatch, reference: string): ExportBatch | null {
  const c = b.customers.find((x) => x.reference === reference)
  return c ? { ...b, customers: [c] } : null
}
