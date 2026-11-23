import { describe, expect, it } from 'vitest'

import { consentWithdrawalEmail } from './withdrawal'

describe('consentWithdrawalEmail', () => {
  it('asks the funder to stop using and delete the details; names only the reference and batch', () => {
    const m = consentWithdrawalEmail({
      funderName: 'Trade Lenda',
      reference: 'G4S-1A2B3C4D',
      batches: ['TL-Batch-004'],
      withdrawnOn: '24 Nov 2026',
    })
    expect(m.subject).toBe('Customer consent withdrawn: G4S-1A2B3C4D (TL-Batch-004)')
    expect(m.text).toContain('stop using')
    expect(m.text).toContain('delete them')
    expect(m.text).toContain('24 Nov 2026')
    expect(m.text).not.toMatch(/\+234|@/)
  })
})
