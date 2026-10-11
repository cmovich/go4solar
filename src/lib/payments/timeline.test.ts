import { describe, expect, it } from 'vitest'

import { timeline } from './timeline'

const base = {
  consumerSigned: false,
  guarantorSigned: false,
  depositPaid: false,
  applicationStatus: 'draft' as const,
  installed: false,
}
const states = (t: ReturnType<typeof timeline>) => t.map((s) => `${s.label}:${s.state}`)

describe('timeline', () => {
  it('starts at signing', () => {
    expect(states(timeline(base))).toEqual([
      'Signed:current',
      'Guarantor signed:todo',
      'Deposit paid:todo',
      'Under review:todo',
      'Approved:todo',
      'Installed:todo',
    ])
  })

  it('after the deposit the application is under review', () => {
    const t = timeline({
      ...base,
      consumerSigned: true,
      guarantorSigned: true,
      depositPaid: true,
      applicationStatus: 'submitted',
    })
    expect(states(t).slice(0, 5)).toEqual([
      'Signed:done',
      'Guarantor signed:done',
      'Deposit paid:done',
      'Under review:current',
      'Approved:todo',
    ])
  })

  it('approved, then installed', () => {
    const approved = {
      ...base,
      consumerSigned: true,
      guarantorSigned: true,
      depositPaid: true,
      applicationStatus: 'approved' as const,
    }
    expect(states(timeline(approved)).slice(3)).toEqual([
      'Under review:done',
      'Approved:done',
      'Installed:current',
    ])
    expect(timeline({ ...approved, installed: true }).every((s) => s.state === 'done')).toBe(true)
  })

  it('a declined application says so at the review step', () => {
    const t = timeline({
      ...base,
      consumerSigned: true,
      guarantorSigned: true,
      depositPaid: true,
      applicationStatus: 'declined',
    })
    expect(t[3]).toMatchObject({ label: 'Not approved', state: 'failed' })
  })
})
