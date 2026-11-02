import { describe, expect, it } from 'vitest'

import { cleanClientError, SAVED_PROGRESS_KEYS } from './clientError'

describe('cleanClientError (browser crash reports for the server log)', () => {
  it('keeps the path, kind and a short one-line message', () => {
    expect(
      cleanClientError({
        kind: 'error',
        path: '/build?lead=x',
        message: 'TypeError: a\nb',
        digest: 'abc',
      }),
    ).toEqual({ kind: 'error', path: '/build', message: 'TypeError: a b', digest: 'abc' })
  })

  it('cuts long messages and hides long digit runs (phone, NIN, BVN, card numbers)', () => {
    const r = cleanClientError({ kind: 'rejection', path: '/', message: `x ${'y'.repeat(600)}` })
    expect(r!.message.length).toBeLessThanOrEqual(300)
    expect(
      cleanClientError({ kind: 'error', path: '/', message: 'bad 08031234567 and 12345678901' })!
        .message,
    ).toBe('bad [number] and [number]')
  })

  it('refuses anything that is not a report', () => {
    expect(cleanClientError(null)).toBeNull()
    expect(cleanClientError({ kind: 'other', path: '/', message: 'x' })).toBeNull()
    expect(
      cleanClientError({ kind: 'error', path: 'https://evil.example', message: 'x' }),
    ).toBeNull()
  })

  it('the saved progress a "Start again" clears', () => {
    expect(SAVED_PROGRESS_KEYS).toEqual(['g4s.builder.v1', 'g4s.calculator.v1'])
  })
})
