import { describe, expect, it } from 'vitest'

import { USER_HEADER, withVerifiedUser } from './requestUser'

describe('withVerifiedUser', () => {
  it('sets the verified user and keeps the other headers', () => {
    const h = withVerifiedUser(new Headers({ accept: 'text/html' }), 'u1')
    expect(h.get(USER_HEADER)).toBe('u1')
    expect(h.get('accept')).toBe('text/html')
  })
  it('a browser cannot send its own: removed, and replaced only by the verified one', () => {
    expect(withVerifiedUser(new Headers({ [USER_HEADER]: 'forged' }), null).has(USER_HEADER)).toBe(
      false,
    )
    expect(withVerifiedUser(new Headers({ [USER_HEADER]: 'forged' }), 'u1').get(USER_HEADER)).toBe(
      'u1',
    )
  })
})
