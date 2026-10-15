import { describe, expect, it } from 'vitest'

import ExcelJS from 'exceljs'

import type { ScenarioInputs } from '@/lib/forecast/scenario'
import { pdfPageTexts } from '@/test/pdfText'

import { forecastExcel, forecastPdf } from './forecastExport'

const inputs: ScenarioInputs = {
  years: 3,
  mode: 'booked',
  newPerMonthYear1: 20,
  growthLow: 0.2,
  growthBase: 0.4,
  growthHigh: 0.6,
  inflationPerYear: 0.12,
  nairaDevaluationPerYear: 0,
  defaultRateExtra: 0,
  avgSystemPrice: 2475248,
  avgCostPrice: 1800000,
  depositShare: 0.2,
  tenureMix: { 3: 0, 6: 0, 9: 0, 12: 1 },
  funderAnnualRate: 0.16,
  ownFundShare: 0,
  unitCosts: { kycPerLoan: 10000, feePerInstalment: 300, lossProvisionShare: 0.02 },
  overheadFixedPerMonthYear1: 4000000,
  overheadGrowthPerYear: 0.15,
  overheadPerSystemYear1: 40000,
  co2TonnesPerSystemYear: 1.5,
  customersPerStaff: 250,
  sampleInputs: ['Unit costs (SAMPLE)', 'CO₂ per system (grid factor unverified)'],
}

describe('forecast exports', () => {
  it('Excel: an Inputs sheet (sample inputs labelled) and a Results sheet (Low / Base / High by year)', async () => {
    const book = new ExcelJS.Workbook()
    const file = await forecastExcel('Base case', inputs)
    // exceljs ships its own (older) Buffer typing; the bytes are the same.
    await book.xlsx.load(file as unknown as Parameters<typeof book.xlsx.load>[0])
    expect(book.worksheets.map((w) => w.name)).toEqual(['Inputs', 'Results'])
    const inputsSheet = book.getWorksheet('Inputs')!
    const rows = inputsSheet
      .getSheetValues()
      .filter(Boolean)
      .map((r) => (r as unknown[]).slice(1).join(' | '))
    expect(rows.some((r) => r.includes('KYC per loan') && r.includes('SAMPLE'))).toBe(true)
    expect(rows.some((r) => r.includes('CO₂ avoided per system') && r.includes('unverified'))).toBe(
      true,
    )
    expect(rows.some((r) => r.includes('Funder rate per year') && !r.includes('SAMPLE'))).toBe(true)
    const results = book.getWorksheet('Results')!
    expect(results.rowCount).toBe(1 + 3 * 3)
    expect(results.getRow(1).values).toEqual(
      expect.arrayContaining(['Scenario', 'Year', 'Net profit', 'Capital needed', 'CO₂ tonnes']),
    )
  })

  it('PDF: Go4Solar document with the scenario, every sample input labelled, page numbers', async () => {
    const pages = pdfPageTexts(await forecastPdf('Base case', inputs))
    const all = pages.join(' ')
    expect(all).toContain('Base case')
    expect(all).toContain('SAMPLE')
    expect(all).toContain('Break-even')
    expect(pages[0]).toMatch(/\b01\b/)
  }, 30_000)
})
