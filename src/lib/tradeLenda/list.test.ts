import { describe, expect, it } from 'vitest'

import { filterCounts, listRows, matchesSearch, statusOf, type ListFacts } from './list'

const facts = (o: Partial<ListFacts> = {}): ListFacts => ({
  hasProfile: false,
  missing: 7,
  verified: false,
  consent: false,
  agreed: false,
  sent: false,
  decided: false,
  ...o,
})

describe('statusOf', () => {
  it('no profile row yet: Not started (even with some details from the waiting list)', () => {
    expect(statusOf(facts())).toBe('not_started')
  })
  it('profile started but not ready: Incomplete', () => {
    expect(statusOf(facts({ hasProfile: true }))).toBe('incomplete')
    expect(statusOf(facts({ hasProfile: true, missing: 0, verified: true, consent: true }))).toBe(
      'incomplete',
    )
  })
  it('complete + the three ticks: Ready to send; then Sent; then Trade Lenda decided', () => {
    const ready = facts({
      hasProfile: true,
      missing: 0,
      verified: true,
      consent: true,
      agreed: true,
    })
    expect(statusOf(ready)).toBe('ready')
    expect(statusOf({ ...ready, sent: true })).toBe('sent')
    expect(statusOf({ ...ready, sent: true, decided: true })).toBe('decided')
  })
})

const row = (name: string, o: Partial<Parameters<typeof matchesSearch>[0]> = {}) => ({
  name,
  phone: '+2348031234567',
  email: null as string | null,
  createdAt: '2026-11-10T10:00:00Z',
  done: 3,
  total: 13,
  status: 'not_started' as const,
  ...o,
})

describe('search, filters and sort', () => {
  it('search by name, email or phone in any format', () => {
    const r = row('Ada Obi', { email: 'ada@example.test' })
    expect(matchesSearch(r, 'ada')).toBe(true)
    expect(matchesSearch(r, 'EXAMPLE')).toBe(true)
    expect(matchesSearch(r, '0803 123 4567')).toBe(true)
    expect(matchesSearch(r, '+234803123')).toBe(true)
    expect(matchesSearch(r, 'bayo')).toBe(false)
  })
  it('counts per filter, All = everyone', () => {
    const rows = [
      row('A'),
      row('B', { status: 'incomplete' }),
      row('C', { status: 'ready' }),
      row('D', { status: 'ready' }),
    ]
    expect(filterCounts(rows)).toEqual({
      all: 4,
      not_started: 1,
      incomplete: 1,
      ready: 2,
      sent: 0,
      decided: 0,
    })
    expect(listRows(rows, { filter: 'ready', q: '', sort: 'newest' }).map((r) => r.name)).toEqual([
      'C',
      'D',
    ])
  })
  it('sort: newest, oldest, most complete', () => {
    const rows = [
      row('old', { createdAt: '2026-11-01T00:00:00Z', done: 10 }),
      row('new', { createdAt: '2026-11-15T00:00:00Z', done: 2 }),
    ]
    const names = (sort: 'newest' | 'oldest' | 'complete') =>
      listRows(rows, { filter: 'all', q: '', sort }).map((r) => r.name)
    expect(names('newest')).toEqual(['new', 'old'])
    expect(names('oldest')).toEqual(['old', 'new'])
    expect(names('complete')).toEqual(['old', 'new'])
  })
})
