import { describe, expect, it } from 'vitest'

import { lagosDate, lockStatus } from './lock'

const row = (dueDate: string, amount = 100, paidAmount = 0) => ({ dueDate, amount, paidAmount })

describe('lockStatus (lock when a payment is N days overdue)', () => {
  const base = { lockAfterDays: 7, extensionUntil: null, active: true }

  it('nothing overdue: no lock', () => {
    expect(lockStatus({ ...base, schedule: [row('2026-11-01')], today: '2026-10-14' })).toEqual({
      daysOverdue: 0,
      lockDue: false,
      lockDate: null,
      pausedUntil: null,
    })
  })

  it('6 days overdue: not yet; 7 days: lock due', () => {
    const schedule = [row('2026-10-01', 100, 100), row('2026-10-07')]
    expect(lockStatus({ ...base, schedule, today: '2026-10-13' })).toMatchObject({
      daysOverdue: 6,
      lockDue: false,
      lockDate: '2026-10-14',
    })
    expect(lockStatus({ ...base, schedule, today: '2026-10-14' })).toMatchObject({
      daysOverdue: 7,
      lockDue: true,
    })
  })

  it('counts from the oldest unpaid payment, part-paid included', () => {
    const schedule = [row('2026-09-01', 100, 50), row('2026-10-01')]
    expect(lockStatus({ ...base, schedule, today: '2026-10-14' }).daysOverdue).toBe(43)
  })

  it('an approved extension pauses the lock until it ends (inclusive)', () => {
    const schedule = [row('2026-09-01')]
    const ext = { ...base, schedule, extensionUntil: '2026-10-20' }
    expect(lockStatus({ ...ext, today: '2026-10-14' })).toMatchObject({
      lockDue: false,
      pausedUntil: '2026-10-20',
    })
    expect(lockStatus({ ...ext, today: '2026-10-20' }).lockDue).toBe(false)
    expect(lockStatus({ ...ext, today: '2026-10-21' })).toMatchObject({
      lockDue: true,
      pausedUntil: null,
    })
  })

  it('only active plans can be locked', () => {
    expect(
      lockStatus({ ...base, active: false, schedule: [row('2026-09-01')], today: '2026-10-14' })
        .lockDue,
    ).toBe(false)
  })
})

describe('lagosDate', () => {
  it('is the calendar date in Lagos (UTC+1)', () => {
    expect(lagosDate(new Date('2026-10-14T22:59:00Z'))).toBe('2026-10-14')
    expect(lagosDate(new Date('2026-10-14T23:00:00Z'))).toBe('2026-10-15')
  })
})
