import { readFileSync } from 'node:fs'

import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { formatNaira } from '@/lib/money'
import { DEFAULT_ENERGY_SETTINGS } from '@/lib/settings/schemas'
import type { Headline } from '@/lib/waitlist/admin'
import { pdfPageTexts } from '@/test/pdfText'

import { renderAgreementPdf } from './AgreementPdf'
import { pdfAssets } from './assets'
import { renderForecastPdf } from './ForecastPdf'
import { WaitlistReport } from './WaitlistReport'

/** Every PDF is set in Inter (embedded), which has the ₦ glyph; Helvetica does not. */
function expectNairaInInter(pdf: Buffer, amount: string) {
  const text = pdfPageTexts(pdf).join('\n')
  expect(text).toContain('₦')
  expect(text).toContain(amount)
  expect(pdf.toString('latin1')).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+Inter/)
}

const amount = formatNaira(2_475_248)

describe('every PDF type shows ₦ amounts in Inter', () => {
  it('signed agreement', async () => {
    const pdf = await renderAgreementPdf({
      title: 'Solar payment plan agreement',
      reference: 'G4S-TEST',
      text: `# Agreement\n\nTotal amount payable: **${amount}**.`,
      signaturePng: readFileSync(pdfAssets.logo),
      signerName: 'Ada Obi',
      signerTitle: null,
      audit: [{ label: 'Signed by', value: 'Ada Obi' }],
      fingerprint: 'abc',
    })
    expectNairaInInter(pdf, amount)
  }, 30_000)

  it('waiting-list report', async () => {
    const empty = {
      count: 1,
      systemValue: 2_475_248,
      depositsPledged: 0,
      financingNeeded: 0,
      co2AvoidedKg: 0,
    }
    const stats: Headline = {
      total: 1,
      complete: 1,
      incomplete: 0,
      byState: [],
      byType: {
        individual: empty,
        business: { ...empty, count: 0 },
        unknown: { ...empty, count: 0 },
      },
      systemValue: 2_475_248,
      depositsPledged: 0,
      financingNeeded: 0,
      averageDepositShare: null,
      readyNow: 0,
      installers: 0,
      sample: false,
      co2AvoidedKgPerYear: 0,
      averageMonthlyEnergySpend: null,
    }
    const pdf = await renderToBuffer(
      createElement(WaitlistReport, {
        stats,
        leads: [],
        generatedAt: new Date('2026-10-14T10:00:00Z'),
        energy: DEFAULT_ENERGY_SETTINGS,
      }) as unknown as ReactElement<DocumentProps>,
    )
    expectNairaInInter(pdf, amount)
  }, 30_000)

  it('forecast', async () => {
    const pdf = await renderForecastPdf({
      name: 'Base',
      generatedAt: '14 October 2026',
      variants: [
        {
          label: 'Base',
          growth: '10% a month',
          breakEven: 'Month 14',
          peakCapitalYear: 2,
          years: [
            {
              year: 1,
              systems: '120',
              netProfit: amount,
              cumulativeNet: amount,
              capitalNeeded: amount,
              co2: '12 t',
              co2Cumulative: '12 t',
            },
          ],
        },
      ],
      inputs: [{ label: 'Average system price', value: amount, note: null }],
      sampleCount: 0,
    })
    expectNairaInInter(pdf, amount)
  }, 30_000)
})
