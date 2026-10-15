import 'server-only'

import ExcelJS from 'exceljs'

import { INPUT_FIELDS, getInput, sampleNote, type InputKind } from '@/lib/forecast/labels'
import { runForecast } from '@/lib/forecast/run'
import {
  scenarioFromInputs,
  type ScenarioInputs,
  type ScenarioVariant,
} from '@/lib/forecast/scenario'
import type { ForecastResult } from '@/lib/forecast/types'
import { formatNaira, formatPercent } from '@/lib/money'
import { renderForecastPdf } from '@/lib/pdf/ForecastPdf'

const VARIANTS: [ScenarioVariant, string][] = [
  ['low', 'Low'],
  ['base', 'Base'],
  ['high', 'High'],
]

export function runVariants(inputs: ScenarioInputs) {
  return VARIANTS.map(([variant, label]) => ({
    variant,
    label,
    growth:
      variant === 'low'
        ? inputs.growthLow
        : variant === 'high'
          ? inputs.growthHigh
          : inputs.growthBase,
    result: runForecast(scenarioFromInputs(inputs, variant)),
  }))
}

export function breakEvenText(r: ForecastResult): string {
  if (r.breakEvenMonth === null) return 'Not within the horizon'
  const m = r.breakEvenMonth
  return `Month ${m} (year ${Math.ceil(m / 12)})`
}

export function formatInput(kind: InputKind, value: number): string {
  if (kind === 'naira') return formatNaira(value)
  if (kind === 'percent') return formatPercent(value, 1)
  if (kind === 'int') return String(Math.round(value))
  return String(Math.round(value * 100) / 100)
}

/** Excel: one sheet of inputs (sample / unverified ones labelled) and one of results. */
export async function forecastExcel(name: string, inputs: ScenarioInputs): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  book.creator = 'Go4Solar Energy Limited'
  book.title = `Forecast: ${name}`

  const sheet = book.addWorksheet('Inputs')
  sheet.columns = [
    { header: 'Input', key: 'label', width: 48 },
    { header: 'Value', key: 'value', width: 18 },
    { header: 'Source', key: 'note', width: 60 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.addRow({
    label: 'Scenario',
    value: name,
    note: inputs.mode === 'cash' ? 'Cash basis' : 'Booked when installed',
  })
  for (const f of INPUT_FIELDS) {
    const note = sampleNote(f.path, inputs.sampleInputs)
    const row = sheet.addRow({
      label: f.label,
      value: getInput(inputs, f.path),
      note: note ? `SAMPLE / unverified: ${note}` : 'From settings',
    })
    row.getCell('value').numFmt =
      f.kind === 'percent' ? '0.0%' : f.kind === 'naira' ? '"₦"#,##0' : '#,##0.##'
    if (note) row.getCell('note').font = { color: { argb: 'FF9A5B00' }, bold: true }
  }

  const results = book.addWorksheet('Results')
  results.columns = [
    { header: 'Scenario', key: 'scenario', width: 10 },
    { header: 'Year', key: 'year', width: 6 },
    { header: 'Systems', key: 'systems', width: 10 },
    { header: 'Contribution', key: 'contribution', width: 18 },
    { header: 'Overheads', key: 'overheads', width: 18 },
    { header: 'Net profit', key: 'net', width: 18 },
    { header: 'Cumulative net', key: 'cumulative', width: 18 },
    { header: 'Capital needed', key: 'capital', width: 18 },
    { header: 'CO₂ tonnes', key: 'co2', width: 12 },
  ]
  results.getRow(1).font = { bold: true }
  for (const v of runVariants(inputs)) {
    for (const y of v.result.years) {
      const row = results.addRow({
        scenario: v.label,
        year: y.year,
        systems: Math.round(y.systems),
        contribution: Math.round(y.contribution),
        overheads: Math.round(y.overheads),
        net: Math.round(y.netProfit),
        cumulative: Math.round(y.cumulativeNet),
        capital: Math.round(y.capitalNeeded),
        co2: Math.round(y.co2Tonnes * 10) / 10,
      })
      for (const k of ['contribution', 'overheads', 'net', 'cumulative', 'capital'])
        row.getCell(k).numFmt = '"₦"#,##0'
    }
  }
  return Buffer.from(await book.xlsx.writeBuffer())
}

/** PDF in the Go4Solar document style. */
export async function forecastPdf(name: string, inputs: ScenarioInputs): Promise<Buffer> {
  const tonnes = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US')
  return renderForecastPdf({
    name,
    generatedAt: new Date().toLocaleDateString('en-GB', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'long',
    }),
    variants: runVariants(inputs).map((v) => ({
      label: v.label,
      growth: formatPercent(v.growth),
      breakEven: breakEvenText(v.result),
      peakCapitalYear: v.result.peakCapitalYear,
      years: v.result.years.map((y) => ({
        year: y.year,
        systems: Math.round(y.systems).toLocaleString('en-US'),
        netProfit: formatNaira(Math.round(y.netProfit)),
        cumulativeNet: formatNaira(Math.round(y.cumulativeNet)),
        capitalNeeded: formatNaira(Math.round(y.capitalNeeded)),
        co2: tonnes(y.co2Tonnes),
        co2Cumulative: tonnes(y.cumulativeCo2Tonnes),
      })),
    })),
    inputs: INPUT_FIELDS.map((f) => ({
      label: f.label,
      value: formatInput(f.kind, getInput(inputs, f.path)),
      note: sampleNote(f.path, inputs.sampleInputs)
        ? `SAMPLE / unverified: ${sampleNote(f.path, inputs.sampleInputs)}`
        : null,
    })),
    sampleCount: INPUT_FIELDS.filter((f) => sampleNote(f.path, inputs.sampleInputs)).length,
  })
}
