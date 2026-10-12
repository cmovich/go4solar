import { createHash, createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { idHash } from './idHash'

const SECRET = 'local-test-only-id-hash-0123456789abcdef'

describe('idHash (keyed hash of a full NIN or BVN)', () => {
  it('is HMAC-SHA256 with the server secret, never a plain hash of the number', () => {
    const h = idHash('nin', '12345678901', SECRET)
    expect(h).toBe(createHmac('sha256', SECRET).update('nin:12345678901').digest('hex'))
    expect(h).not.toBe(createHash('sha256').update('12345678901').digest('hex'))
    expect(h).not.toContain('12345678901')
  })

  it('the same number always gives the same hash; a different secret gives a different one', () => {
    expect(idHash('nin', '12345678901', SECRET)).toBe(idHash('nin', '12345678901', SECRET))
    expect(idHash('nin', '12345678901', SECRET + 'x')).not.toBe(
      idHash('nin', '12345678901', SECRET),
    )
  })

  it('a NIN and a BVN with the same digits do not collide', () => {
    expect(idHash('nin', '22222222222', SECRET)).not.toBe(idHash('bvn', '22222222222', SECRET))
  })

  it('ignores spaces and dashes typed by the user', () => {
    expect(idHash('nin', '123 4567-8901', SECRET)).toBe(idHash('nin', '12345678901', SECRET))
  })

  it('rejects anything that is not 11 digits', () => {
    expect(() => idHash('nin', '1234', SECRET)).toThrow()
  })

  it('refuses to run without a long enough ID_HASH_SECRET', () => {
    expect(() => idHash('nin', '12345678901', '')).toThrow(/ID_HASH_SECRET/)
    expect(() => idHash('nin', '12345678901', 'short')).toThrow(/ID_HASH_SECRET/)
  })
})
