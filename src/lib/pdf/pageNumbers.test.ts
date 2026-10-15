import { readFileSync } from 'node:fs'
import path from 'node:path'

import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_ENERGY_SETTINGS } from '@/lib/settings/schemas'
import { pdfPageTexts } from '@/test/pdfText'
import type { Headline } from '@/lib/waitlist/admin'

import { renderAgreementPdf } from './AgreementPdf'
import { WaitlistReport } from './WaitlistReport'

const empty = { count: 0, systemValue: 0, depositsPledged: 0, financingNeeded: 0, co2AvoidedKg: 0 }
const stats: Headline = {
  total: 0,
  complete: 0,
  incomplete: 0,
  byState: [],
  byType: { individual: empty, business: empty, unknown: empty },
  systemValue: 0,
  depositsPledged: 0,
  financingNeeded: 0,
  averageDepositShare: null,
  readyNow: 0,
  installers: 0,
  sample: false,
  co2AvoidedKgPerYear: 0,
  averageMonthlyEnergySpend: null,
}

describe('PDF page numbers', () => {
  it('the agreement prints 01 and 02 in the footer', async () => {
    const pdf = await renderAgreementPdf({
      title: 'Guarantee',
      reference: 'G4S-TEST',
      text: '# Guarantee\n\nShort text.',
      signaturePng: readFileSync(path.join(process.cwd(), 'public/brand/go4solar-logo.png')),
      signerName: 'Ada Obi',
      signerTitle: null,
      audit: [{ label: 'Signed by', value: 'Ada Obi' }],
      fingerprint: 'abc',
    })
    const pages = pdfPageTexts(pdf)
    expect(pages).toHaveLength(2)
    expect(pages[0]).toMatch(/\b01\b/)
    expect(pages[1]).toMatch(/\b02\b/)
  }, 30_000)

  it('the waiting-list report prints 01 and 02 in the footer', async () => {
    const pdf = await renderToBuffer(
      createElement(WaitlistReport, {
        stats,
        leads: [],
        generatedAt: new Date('2026-10-11T10:00:00Z'),
        energy: DEFAULT_ENERGY_SETTINGS,
      }) as unknown as ReactElement<DocumentProps>,
    )
    const pages = pdfPageTexts(pdf)
    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(pages[0]).toMatch(/\b01\b/)
    expect(pages[1]).toMatch(/\b02\b/)
  }, 30_000)
})
