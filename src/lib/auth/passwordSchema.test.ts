import { describe, expect, it } from 'vitest'

import { forgotPasswordSchema, setPasswordSchema } from './passwordSchema'

describe('setPasswordSchema', () => {
  const ok = 'correct horse battery'

  it('accepts 12+ characters typed the same twice', () => {
    expect(setPasswordSchema.safeParse({ password: ok, confirm: ok }).success).toBe(true)
  })

  it('needs at least 12 characters', () => {
    const r = setPasswordSchema.safeParse({ password: 'short-pass1', confirm: 'short-pass1' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('Use at least 12 characters')
  })

  it('the two entries must match', () => {
    const r = setPasswordSchema.safeParse({ password: ok, confirm: `${ok}x` })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['confirm'])
    expect(r.error?.issues[0]?.message).toBe('The two passwords are not the same')
  })

  it('at most 72 characters (the most the login system can store)', () => {
    const long = 'a'.repeat(73)
    expect(setPasswordSchema.safeParse({ password: long, confirm: long }).success).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('needs a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true)
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false)
  })
})
