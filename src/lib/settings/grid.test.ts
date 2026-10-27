import { describe, expect, it } from 'vitest'

import { gridFrom } from './schemas'

describe('gridFrom (stored grid answers)', () => {
  it('reads a valid answer', () => {
    expect(gridFrom({ mode: 'A', pattern: 'daily', dayHours: 2, nightHours: 4 })).toEqual({
      mode: 'A',
      pattern: 'daily',
      dayHours: 2,
      nightHours: 4,
    })
  })
  it('missing or malformed → null (sized as no grid)', () => {
    expect(gridFrom(undefined)).toBeNull()
    expect(gridFrom(null)).toBeNull()
    expect(gridFrom({ mode: 'X', pattern: 'daily', dayHours: 0, nightHours: 0 })).toBeNull()
    expect(gridFrom({ mode: 'A', pattern: 'daily', dayHours: 30, nightHours: 0 })).toBeNull()
  })
})
