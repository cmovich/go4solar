import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { DEFAULT_COMPANY } from '@/lib/company/schema'
import { renderFunderBatchPdf } from '@/lib/pdf/FunderBatchPdf'
import { pdfPageTexts } from '@/test/pdfText'

import { batchTotals } from './batch'
import { batchCsv, batchXlsx, oneCustomer, type ExportBatch } from './exports'
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
