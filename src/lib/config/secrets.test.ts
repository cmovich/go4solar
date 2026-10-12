import { afterEach, describe, expect, it } from 'vitest'

import { newGuaranteeToken } from '@/lib/agreements/tokens'
import { idHash } from '@/lib/ids/idHash'

import { LOCAL_TEST_SECRET_PREFIX, deploySecretProblems } from './secrets'

const good = { ID_HASH_SECRET: 'x'.repeat(64), GUARANTOR_TOKEN_SECRET: 'y'.repeat(64) }
const testOnly = {
  ID_HASH_SECRET: `${LOCAL_TEST_SECRET_PREFIX}id-hash-0123456789abcdef`,
  GUARANTOR_TOKEN_SECRET: `${LOCAL_TEST_SECRET_PREFIX}guarantor-0123`,
}

describe('deploySecretProblems (checked when Vercel builds)', () => {
  it('local builds and tests: no requirement (tests bring their own values)', () => {
    expect(deploySecretProblems({})).toEqual([])
    expect(deploySecretProblems({ ...testOnly })).toEqual([])
  })

  it('Vercel preview / production: both secrets must be set and long enough', () => {
    for (const VERCEL_ENV of ['preview', 'production']) {
      expect(deploySecretProblems({ VERCEL_ENV })).toEqual([
        'ID_HASH_SECRET is missing or shorter than 32 characters',
        'GUARANTOR_TOKEN_SECRET is missing or shorter than 16 characters',
      ])
      expect(deploySecretProblems({ VERCEL_ENV, ...good })).toEqual([])
    }
  })

  it('Vercel never accepts a local test value', () => {
    expect(deploySecretProblems({ VERCEL_ENV: 'preview', ...testOnly })).toEqual([
      'ID_HASH_SECRET is a local test value',
      'GUARANTOR_TOKEN_SECRET is a local test value',
    ])
  })
})

describe('the hashing functions refuse local test values on Vercel', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('locally a test value works', () => {
    delete process.env.VERCEL_ENV
    expect(idHash('nin', '12345678901', testOnly.ID_HASH_SECRET)).toMatch(/^[0-9a-f]{64}$/)
    expect(newGuaranteeToken(testOnly.GUARANTOR_TOKEN_SECRET).hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('on a preview or production it stops with a clear error', () => {
    for (const env of ['preview', 'production']) {
      process.env.VERCEL_ENV = env
      expect(() => idHash('nin', '12345678901', testOnly.ID_HASH_SECRET)).toThrow(
        /local test value/,
      )
      expect(() => newGuaranteeToken(testOnly.GUARANTOR_TOKEN_SECRET)).toThrow(/local test value/)
      // A real secret is fine there.
      expect(idHash('nin', '12345678901', good.ID_HASH_SECRET)).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})
