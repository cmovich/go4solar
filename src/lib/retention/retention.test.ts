import { describe, expect, it } from 'vitest'

import { selectForPurge, type RetentionInput } from './rules'

const now = new Date('2026-12-01T12:00:00Z')
const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

function input(over: Partial<RetentionInput> = {}): RetentionInput {
  return {
    applications: [{ id: 'A', status: 'draft' }],
    checks: [{ subjectId: 'A', kind: 'nin', status: 'failed', createdAt: days(40) }],
    documents: [
      { id: 'd1', applicationId: 'A', kind: 'nin_front', storagePath: 'u/A/nin_front.jpg' },
      { id: 'd2', applicationId: 'A', kind: 'address_proof', storagePath: 'u/A/address.pdf' },
    ],
    waitlist: [],
    ...over,
  }
}

describe('selectForPurge: failed-KYC images after 30 days', () => {
  it('picks only the ID image of a failed NIN check older than 30 days', () => {
    expect(selectForPurge(input(), now).kycDocuments.map((d) => d.id)).toEqual(['d1'])
  })

  it('keeps it for 30 days', () => {
    const r = selectForPurge(
      input({ checks: [{ subjectId: 'A', kind: 'nin', status: 'failed', createdAt: days(29) }] }),
      now,
    )
    expect(r.kycDocuments).toEqual([])
  })

  it('keeps it when a later attempt passed, or the check is still with a person', () => {
    expect(
      selectForPurge(
        input({
          checks: [
            { subjectId: 'A', kind: 'nin', status: 'failed', createdAt: days(40) },
            { subjectId: 'A', kind: 'nin', status: 'passed', createdAt: days(39) },
          ],
        }),
        now,
      ).kycDocuments,
    ).toEqual([])
    expect(
      selectForPurge(
        input({
          checks: [{ subjectId: 'A', kind: 'nin', status: 'manual_review', createdAt: days(60) }],
        }),
        now,
      ).kycDocuments,
    ).toEqual([])
  })

  it('never touches an application that went ahead (submitted, under review, approved)', () => {
    for (const status of ['submitted', 'under_review', 'approved', 'more_info'])
      expect(
        selectForPurge(input({ applications: [{ id: 'A', status }] }), now).kycDocuments,
      ).toEqual([])
  })

  it('a failed CAC check removes the CAC certificate only', () => {
    const r = selectForPurge(
      input({
        checks: [{ subjectId: 'A', kind: 'cac', status: 'failed', createdAt: days(45) }],
        documents: [
          { id: 'c1', applicationId: 'A', kind: 'cac_certificate', storagePath: 'u/A/cac.pdf' },
          { id: 'n1', applicationId: 'A', kind: 'nin_front', storagePath: 'u/A/nin.jpg' },
        ],
      }),
      now,
    )
    expect(r.kycDocuments.map((d) => d.id)).toEqual(['c1'])
  })

  it('no checks at all: nothing', () => {
    expect(selectForPurge(input({ checks: [] }), now).kycDocuments).toEqual([])
  })
})

describe('selectForPurge: cleared waiting-list rows', () => {
  it('only rows cleared more than 7 days ago', () => {
    const r = selectForPurge(
      input({
        waitlist: [
          { id: 'w1', table: 'waitlist_consumers', clearedAt: days(8) },
          { id: 'w2', table: 'waitlist_consumers', clearedAt: days(6) },
          { id: 'w3', table: 'waitlist_installers', clearedAt: days(30) },
          { id: 'w4', table: 'waitlist_consumers', clearedAt: null },
        ],
      }),
      now,
    )
    expect(r.waitlist.map((w) => w.id)).toEqual(['w1', 'w3'])
  })
})

// Prompt 16A: nothing is deleted on go4solar.app until Semako switches deleting on.
describe('retentionDryRun', () => {
  it('counts only, unless RETENTION_ENABLED=true and no ?dry=1', async () => {
    const { retentionDryRun } = await import('./rules')
    expect(retentionDryRun({}, false)).toBe(true)
    expect(retentionDryRun({ RETENTION_ENABLED: 'yes' }, false)).toBe(true)
    expect(retentionDryRun({ RETENTION_ENABLED: 'true' }, true)).toBe(true)
    expect(retentionDryRun({ RETENTION_ENABLED: 'true' }, false)).toBe(false)
  })
})
