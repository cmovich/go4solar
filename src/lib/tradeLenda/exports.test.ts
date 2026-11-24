import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { DEFAULT_COMPANY } from '@/lib/company/schema'
import { renderFunderBatchPdf } from '@/lib/pdf/FunderBatchPdf'
import { pdfPageTexts } from '@/test/pdfText'

import { batchTotals } from './batch'
import { batchCsv, batchXlsx, customerRows, oneCustomer, type ExportBatch } from './exports'
import type { LendingType } from './figures'
import { makeSnapshot, ogaCostFigures } from './fixture'
import { funderSafetyProblems } from './snapshot'

const batch = (type: LendingType): ExportBatch => {
  const c = makeSnapshot(type)
  return {
    number: 'TL-Batch-001',
    version: 1,
    lendingType: type,
    createdAt: '2026-11-18T10:00:00Z',
    totals: batchTotals(type, [c]),
    customers: [c],
    decisions: {},
  }
}

async function xlsxText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const out: string[] = []
  wb.eachSheet((sheet) => {
    out.push(sheet.name)
    sheet.eachRow((row) => out.push(JSON.stringify(row.values)))
  })
  return out.join('\n')
}

describe.each(['customer', 'go4solar'] as const)('Trade Lenda files (%s)', (type) => {
  const b = batch(type)
  // Lends to Go4Solar: no figure based on our cost may appear either.
  const costs = type === 'go4solar' ? ogaCostFigures() : []

  it('CSV: the customer, the figures and the lending type; nothing internal', () => {
    const csv = batchCsv(b)
    expect(csv).toContain('Ada Obi')
    expect(csv).toContain(type === 'customer' ? 'Lends to customers' : 'Lends to Go4Solar')
    expect(csv).toContain('Total repayment')
    expect(funderSafetyProblems(csv, costs)).toEqual([])
    // We never collect NIN/BVN for Trade Lenda.
    expect(csv).not.toMatch(/NIN|BVN/)
  })

  it('Excel: summary sheet first, then customers; nothing internal', async () => {
    const text = await xlsxText(await batchXlsx(b, DEFAULT_COMPANY))
    expect(text.split('\n')[0]).toBe('Summary')
    expect(text).toContain('Total financed')
    expect(funderSafetyProblems(text, costs)).toEqual([])
  })

  it('PDF: totals page first (logo, company, batch number, date); nothing internal', async () => {
    const pages = pdfPageTexts(await renderFunderBatchPdf(b, DEFAULT_COMPANY))
    expect(pages[0]).toContain('Batch summary')
    expect(pages[0]).toContain('TL-Batch-001')
    expect(pages[0]).toContain('2026-11-18')
    expect(pages[0]).toContain(DEFAULT_COMPANY.name)
    expect(pages.join(' ')).toContain('Ada Obi')
    expect(funderSafetyProblems(pages.join(' '), costs)).toEqual([])
  })

  it('one customer: the same formats', () => {
    expect(oneCustomer(b, 'G4S-1234ABCD')?.customers).toHaveLength(1)
    expect(oneCustomer(b, 'nope')).toBeNull()
  })
})

describe('optional details: in the files only when filled in', () => {
  it('date of birth, work, income and guarantor are left out when empty', () => {
    const c = makeSnapshot('customer')
    const empty = {
      ...c,
      dateOfBirth: null,
      work: { employmentType: null, employer: null, jobTitle: null, incomeRange: null },
      guarantor: { name: null, phone: null, relationship: null, address: null },
    }
    const labels = customerRows(empty).map(([k]) => k)
    for (const l of ['Date of birth', 'Work', 'Monthly income', 'Guarantor']) {
      expect(labels).not.toContain(l)
    }
    expect(customerRows(c).map(([k]) => k)).toContain('Date of birth')
    expect(labels).toContain('Details confirmed by phone')
  })
  it('a business shows its name and the contact person', () => {
    const c = {
      ...makeSnapshot('customer'),
      applicantType: 'business' as const,
      business: { name: 'Ada Stores', contactRole: 'Owner' },
    }
    const rows = Object.fromEntries(customerRows(c))
    expect(rows.Business).toBe('Ada Stores')
    expect(rows['Contact person']).toBe('Ada Obi, Owner')
  })
})

describe('Basic and Full exports (0043): financing per person and in the totals', () => {
  const withLevel = (level: 'basic' | 'full'): ExportBatch => {
    const base = makeSnapshot('customer')
    const financing = {
      months: 12,
      deposit: 261_400,
      depositStatus: 'to be paid' as const,
      depositPaid: 0,
      financed: 1_045_600,
      monthly: 128_957,
      totalRepayment: 1_547_488,
      earnings: 501_888,
    }
    const c =
      level === 'basic'
        ? {
            ...base,
            level,
            financing,
            dateOfBirth: null,
            work: { employmentType: null, employer: null, jobTitle: null, incomeRange: null },
            guarantor: { name: null, phone: null, relationship: null, address: null },
          }
        : { ...base, level, financing }
    return {
      number: 'TL-Batch-009',
      version: 1,
      lendingType: 'customer',
      createdAt: '2026-11-24T10:00:00Z',
      totals: {
        ...batchTotals('customer', [c]),
        financing: {
          people: 1,
          basic: level === 'basic' ? 1 : 0,
          full: level === 'full' ? 1 : 0,
          depositsPaid: 0,
          depositsToPay: 261_400,
          financed: 1_045_600,
          totalRepayment: 1_547_488,
          earnings: 501_888,
          monthly: 128_957,
        },
      },
      customers: [c],
      decisions: {},
    }
  }

  it('Basic CSV: level, deposit status, financed ₦1,045,600, earnings ₦501,888; no date of birth or guarantor; funder-safe', () => {
    const csv = batchCsv(withLevel('basic'))
    expect(csv).toContain('Basic')
    expect(csv).toContain('to be paid')
    expect(csv).toContain('1045600')
    expect(csv).toContain('501888')
    expect(csv).toContain('1547488')
    expect(csv).not.toContain('1990-01-01')
    expect(funderSafetyProblems(csv, ogaCostFigures())).toEqual([])
  })

  it('Full PDF: the totals page lists Basic / Full, deposits, funder finances and earnings; funder-safe', async () => {
    const pdf = await renderFunderBatchPdf(withLevel('full'), DEFAULT_COMPANY)
    const text = pdfPageTexts(pdf).join('\n')
    expect(text).toContain('Funder earnings (total interest/charge)')
    expect(text).toContain('₦501,888')
    expect(text).toContain('0 Basic · 1 Full')
    expect(funderSafetyProblems(text, ogaCostFigures())).toEqual([])
  })
})
