import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { CONSUMER_TICKS, GUARANTOR_TICKS } from '@/lib/agreements/ticks'
import { CONSENT_TEXT } from '@/lib/waitlist/schema'

import { BIOMETRIC_CONSENT_TEXT, CONSENTS, consentRecord, tickConsents } from './texts'

describe('consent texts', () => {
  it('every consent has a dated version and the exact text shown on screen', () => {
    for (const [key, c] of Object.entries(CONSENTS)) {
      expect(c.version).toMatch(new RegExp(`^${key}-\\d{4}-\\d{2}-\\d{2}$`))
      expect(c.text.length).toBeGreaterThan(20)
    }
    expect(CONSENTS.contact.text).toBe(CONSENT_TEXT)
    expect(CONSENTS.biometric.text).toBe(BIOMETRIC_CONSENT_TEXT)
  })

  it('a record carries the kind, the version and the SHA-256 of the exact wording', () => {
    const r = consentRecord('biometric')
    expect(r).toEqual({
      kind: 'biometric',
      text_version: CONSENTS.biometric.version,
      text_sha256: createHash('sha256').update(BIOMETRIC_CONSENT_TEXT).digest('hex'),
    })
  })

  it('each signing tick maps to a consent with its own wording', () => {
    const consumer = tickConsents('consumer')
    expect(consumer.map((c) => c.kind).sort()).toEqual(
      ['agreement', 'biometric', 'collateral', 'credit_check', 'remote_lock'].sort(),
    )
    for (const t of CONSUMER_TICKS) {
      const c = consumer.find((x) => x.tickId === t.id)!
      expect(c.text_sha256).toBe(createHash('sha256').update(t.label).digest('hex'))
    }
    const guarantor = tickConsents('guarantor')
    expect(guarantor).toHaveLength(GUARANTOR_TICKS.length)
    expect(guarantor.map((c) => c.kind)).toContain('credit_check')
  })
})
