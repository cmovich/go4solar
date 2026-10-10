import { describe, expect, it } from 'vitest'

import { clientIp } from './clientIp'

describe('clientIp', () => {
  it('takes the first address in x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '197.210.1.2, 10.0.0.1' })
    expect(clientIp(h)).toBe('197.210.1.2')
  })

  it('falls back to x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '41.58.0.9' }))).toBe('41.58.0.9')
  })

  it('returns "unknown" when nothing is set', () => {
    expect(clientIp(new Headers())).toBe('unknown')
  })

  it('trims whitespace and ignores empty entries', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': ' , 102.89.3.4 ' }))).toBe('102.89.3.4')
  })
})
