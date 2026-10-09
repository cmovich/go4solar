import { describe, expect, it } from 'vitest'

import {
  InvalidPhoneError,
  formatNaira,
  formatPercent,
  normalisePhoneNG,
  roundNaira,
  roundToStep,
} from './money'

describe('formatNaira', () => {
  it('formats whole naira with the ₦ sign and thousands separators', () => {
    expect(formatNaira(2475248)).toBe('₦2,475,248')
  })

  it('formats zero', () => {
    expect(formatNaira(0)).toBe('₦0')
  })

  it('puts a minus sign before the ₦ for negative amounts', () => {
    expect(formatNaira(-39603)).toBe('−₦39,603')
  })

  it('rounds kobo away before formatting', () => {
    expect(formatNaira(165016.5)).toBe('₦165,017')
    expect(formatNaira(1999.4)).toBe('₦1,999')
  })
})

describe('formatPercent', () => {
  it('turns a decimal share into a percentage with the given decimals', () => {
    expect(formatPercent(0.42203, 1)).toBe('42.2%')
  })

  it('defaults to no decimals', () => {
    expect(formatPercent(0.2)).toBe('20%')
  })
})

describe('roundNaira', () => {
  it('rounds to the nearest whole naira (Math.round)', () => {
    expect(roundNaira(165016.5)).toBe(165017)
    expect(roundNaira(165016.4)).toBe(165016)
  })
})

describe('roundToStep', () => {
  it('rounds to the nearest multiple of the step', () => {
    expect(roundToStep(853218, 100)).toBe(853200)
    expect(roundToStep(853250, 100)).toBe(853300)
  })

  it('rejects a non-positive step', () => {
    expect(() => roundToStep(100, 0)).toThrow(RangeError)
  })
})

describe('normalisePhoneNG', () => {
  it('converts a local 0803… number to E.164', () => {
    expect(normalisePhoneNG('08031234567')).toBe('+2348031234567')
  })

  it('keeps an E.164 number unchanged', () => {
    expect(normalisePhoneNG('+2348031234567')).toBe('+2348031234567')
  })

  it('accepts spaces, dashes and the 234 prefix without a plus', () => {
    expect(normalisePhoneNG('0803 123 4567')).toBe('+2348031234567')
    expect(normalisePhoneNG('0803-123-4567')).toBe('+2348031234567')
    expect(normalisePhoneNG('2348031234567')).toBe('+2348031234567')
  })

  it('throws InvalidPhoneError for anything that is not a Nigerian mobile number', () => {
    expect(() => normalisePhoneNG('12345')).toThrow(InvalidPhoneError)
    expect(() => normalisePhoneNG('')).toThrow(InvalidPhoneError)
    expect(() => normalisePhoneNG('+447911123456')).toThrow(InvalidPhoneError)
  })
})
