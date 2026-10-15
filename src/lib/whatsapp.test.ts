import { describe, expect, it } from 'vitest'

import { whatsappDigits, whatsappHref } from './whatsapp'

describe('whatsappDigits', () => {
  it.each([
    ['08182112423', '2348182112423'],
    ['0818 211 2423', '2348182112423'],
    ['+234 818 211 2423', '2348182112423'],
    ['2348182112423', '2348182112423'],
    ['+2348182112423', '2348182112423'],
    ['234-818-211-2423', '2348182112423'],
    ['8182112423', '2348182112423'],
  ])('normalises %s to %s', (input, expected) => {
    expect(whatsappDigits(input)).toBe(expected)
  })

  it('leaves a non-Nigerian international number as its digits', () => {
    expect(whatsappDigits('+44 7911 123456')).toBe('447911123456')
  })

  it('returns null for empty or junk input', () => {
    expect(whatsappDigits('')).toBeNull()
    expect(whatsappDigits('   ')).toBeNull()
    expect(whatsappDigits('call me')).toBeNull()
  })
})

describe('whatsappHref', () => {
  it('builds a wa.me link', () => {
    expect(whatsappHref('0818 211 2423')).toBe('https://wa.me/2348182112423')
  })

  it('adds a pre-filled message when given', () => {
    expect(whatsappHref('08182112423', 'Hello Go4Solar')).toBe(
      'https://wa.me/2348182112423?text=Hello%20Go4Solar',
    )
  })

  it('falls back to the given number when the primary is empty', () => {
    expect(whatsappHref('', undefined, '08037142948')).toBe('https://wa.me/2348037142948')
  })
})
