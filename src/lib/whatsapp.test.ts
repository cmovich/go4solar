import { describe, expect, it } from 'vitest'

import { whatsappDigits, whatsappHref } from './whatsapp'

describe('whatsappDigits', () => {
  it.each([
    ['09018617165', '2349018617165'],
    ['0901 861 7165', '2349018617165'],
    ['+234 901 861 7165', '2349018617165'],
    ['2349018617165', '2349018617165'],
    ['+2349018617165', '2349018617165'],
    ['234-901-861-7165', '2349018617165'],
    ['9018617165', '2349018617165'],
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
    expect(whatsappHref('0901 861 7165')).toBe('https://wa.me/2349018617165')
  })

  it('adds a pre-filled message when given', () => {
    expect(whatsappHref('09018617165', 'Hello Go4Solar')).toBe(
      'https://wa.me/2349018617165?text=Hello%20Go4Solar',
    )
  })

  it('falls back to the given number when the primary is empty', () => {
    expect(whatsappHref('', undefined, '08037142948')).toBe('https://wa.me/2348037142948')
  })
})
