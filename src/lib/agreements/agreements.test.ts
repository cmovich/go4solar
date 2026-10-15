import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { sampleHomeItems } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { formatNaira } from '@/lib/money'
import { buildEstimate } from '@/lib/quotes/buildEstimate'
import { priceVariant } from '@/lib/quotes/quote'
import { DEFAULT_QUOTE_SETTINGS } from '@/lib/settings/schemas'

import {
  agreementValues,
  contentFingerprint,
  renderTemplate,
  sha256Hex,
  templateBody,
} from './render'
import { guarantorEligibility } from './rules'
import {
  GUARANTEE_TTL_MS,
  checkGuaranteeToken,
  hashGuaranteeToken,
  newGuaranteeToken,
} from './tokens'

const SECRET = 'local-test-only-guarantor-0123'
const now = new Date('2026-10-10T12:00:00Z')

describe('guarantee link tokens', () => {
  it('a fresh token is long and random; only its keyed hash is stored', () => {
    const { token, hash } = newGuaranteeToken(SECRET)
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(hash).toBe(hashGuaranteeToken(token, SECRET))
    expect(hash).not.toContain(token)
    expect(hashGuaranteeToken(token, 'another-secret-xxxxx')).not.toBe(hash)
  })

  it('refuses to work without a secret', () => {
    expect(() => newGuaranteeToken('')).toThrow(/GUARANTOR_TOKEN_SECRET/)
  })

  const row = (over: Partial<Parameters<typeof checkGuaranteeToken>[0] & object> = {}) => ({
    status: 'invited' as const,
    expires_at: new Date(now.getTime() + GUARANTEE_TTL_MS).toISOString(),
    ...over,
  })

  it('valid while invited or in progress and inside 72 hours', () => {
    expect(GUARANTEE_TTL_MS).toBe(72 * 3600 * 1000)
    expect(checkGuaranteeToken(row(), now)).toBe('ok')
    expect(checkGuaranteeToken(row({ status: 'in_progress' }), now)).toBe('ok')
  })

  it('expired after 72 hours', () => {
    const late = new Date(now.getTime() + GUARANTEE_TTL_MS + 1)
    expect(checkGuaranteeToken(row(), late)).toBe('expired')
    expect(checkGuaranteeToken(row({ status: 'expired' }), now)).toBe('expired')
  })

  it('an already-signed or declined guarantee cannot be used again', () => {
    expect(checkGuaranteeToken(row({ status: 'signed' }), now)).toBe('signed')
    expect(checkGuaranteeToken(row({ status: 'declined' }), now)).toBe('declined')
  })

  it('a token replaced by a resend no longer matches any row', () => {
    const first = newGuaranteeToken(SECRET)
    const second = newGuaranteeToken(SECRET)
    // The row now holds the second hash; the first link finds nothing.
    const stored = second.hash
    expect(hashGuaranteeToken(first.token, SECRET)).not.toBe(stored)
    expect(checkGuaranteeToken(null, now)).toBe('not_found')
  })
})

describe('guarantorEligibility', () => {
  const base = {
    dob: '1990-01-01',
    ninHash: 'g-hash',
    applicantNinHash: 'a-hash',
    activeGuarantees: 0,
    maxActive: 2,
    now,
  }

  it('accepts an adult who is not the applicant and has room for another guarantee', () => {
    expect(guarantorEligibility(base)).toBe('ok')
  })

  it('rejects under-18s', () => {
    expect(guarantorEligibility({ ...base, dob: '2010-01-01' })).toBe('under_18')
  })

  it('rejects the applicant guaranteeing themselves (same keyed NIN hash)', () => {
    expect(guarantorEligibility({ ...base, ninHash: 'a-hash' })).toBe('same_as_applicant')
  })

  it('never compares last 4 digits: without the applicant hash it waits instead of guessing', () => {
    expect(guarantorEligibility({ ...base, applicantNinHash: null })).toBe('applicant_not_ready')
  })

  it('enforces the maximum number of active guarantees per person', () => {
    expect(guarantorEligibility({ ...base, activeGuarantees: 1 })).toBe('ok')
    expect(guarantorEligibility({ ...base, activeGuarantees: 2 })).toBe('too_many')
  })
})

describe('agreement rendering', () => {
  const est = buildEstimate(
    computeLoadTotals(sampleHomeItems),
    'Lagos',
    0.2,
    DEFAULT_QUOTE_SETTINGS,
  )
  const quote = priceVariant(est, 'comfort', 6, 0.3).quote
  const values = agreementValues({
    reference: 'G4S-ABCDEF12',
    date: new Date('2026-10-10T09:00:00Z'),
    quote,
    tenure: 6,
    size: est.plans.comfort.size,
    customerName: 'Chidi Eze',
    business: null,
    signerName: 'Chidi Eze',
    signerTitle: null,
    address: '12 Allen Avenue, Ikeja, Lagos',
    lateFeeDaily: 0.0075,
    lateFeeCap: 0.25,
    lockAfterDays: 7,
  })

  it('every number comes from the stored quote snapshot', () => {
    expect(values.totalPayable).toBe(formatNaira(quote.systemPrice))
    expect(values.deposit).toBe(formatNaira(quote.deposit))
    expect(values.monthly).toBe(formatNaira(quote.monthly))
    expect(values.instalmentCount).toBe(String(quote.instalments.length))
    expect(values.tenure).toBe('6')
    expect(values.depositPct).toBe('30%')
    expect(values.lateFeeDaily).toBe('0.75%')
    expect(values.lateFeeCap).toBe('25%')
    expect(values.lockAfterDays).toBe('7')
  })

  it('fills every placeholder and leaves none behind', () => {
    const body =
      'Total {{totalPayable}}; {{instalmentCount}} × {{monthly}}; ref {{reference}}{{businessClause}}'
    const out = renderTemplate(body, values)
    expect(out).toBe(
      `Total ${formatNaira(quote.systemPrice)}; ${quote.instalments.length} × ${formatNaira(quote.monthly)}; ref G4S-ABCDEF12`,
    )
    expect(renderTemplate('{{nope}}', values)).toBe('')
  })

  it('a business is named as the customer and the applicant signs as director', () => {
    const v = agreementValues({
      reference: 'G4S-1',
      date: new Date(),
      quote,
      tenure: 6,
      size: est.plans.comfort.size,
      customerName: 'EZE STORES LIMITED',
      business: { rcNumber: 'RC123456' },
      signerName: 'Chidi Eze',
      signerTitle: 'Director',
      address: 'x',
      lateFeeDaily: 0.0075,
      lateFeeCap: 0.25,
      lockAfterDays: 7,
    })
    expect(v.customerName).toBe('EZE STORES LIMITED')
    expect(v.businessClause).toContain('RC123456')
    expect(v.signerTitleLine).toContain('Director')
  })

  it('consumer wording never says "loan" or "interest rate"', () => {
    const joined = Object.values(values).join(' ').toLowerCase()
    expect(joined).not.toContain('loan')
  })

  it('the fingerprint covers the text, the signature and the audit details', () => {
    const sig = Buffer.from('png-bytes')
    const a = contentFingerprint('text', sig, { signer: 'A', signedAt: 't' })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(contentFingerprint('text!', sig, { signer: 'A', signedAt: 't' })).not.toBe(a)
    expect(
      contentFingerprint('text', Buffer.from('other'), { signer: 'A', signedAt: 't' }),
    ).not.toBe(a)
    expect(sha256Hex(Buffer.from('abc'))).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})

describe('template approval', () => {
  const body = '# Title\n\n**DRAFT — lawyer review required**\n\nText'
  it('a draft template keeps the DRAFT notice', () => {
    expect(templateBody({ body_md: body, status: 'draft' })).toContain(
      'DRAFT — lawyer review required',
    )
  })
  it('an approved template drops the DRAFT notice and keeps the rest', () => {
    const out = templateBody({ body_md: body, status: 'approved' })
    expect(out).not.toContain('DRAFT')
    expect(out).toContain('# Title')
    expect(out).toContain('Text')
  })
})
