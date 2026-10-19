import { describe, expect, it } from 'vitest'

import { partnerSchema, publishProblem, testimonialSchema } from './schemas'

const good = {
  clientName: 'Amaka',
  clientCity: 'Ikeja',
  clientQuote: 'No more generator noise at night.',
  systemSize: '3.5 kVA · 7.5 kWh',
  installerName: 'Musa Bello',
  consentClient: true,
  consentInstaller: true,
}

describe('testimonialSchema', () => {
  it('accepts a complete testimonial', () => {
    expect(testimonialSchema.safeParse(good).success).toBe(true)
  })
  it('a quote is at most 220 characters', () => {
    const r = testimonialSchema.safeParse({ ...good, clientQuote: 'x'.repeat(221) })
    expect(r.error?.issues[0]?.message).toBe('Keep the quote to 220 characters or fewer')
  })
  it('first name only (no surname shown publicly)', () => {
    const r = testimonialSchema.safeParse({ ...good, clientName: 'Amaka Okoro' })
    expect(r.error?.issues[0]?.message).toBe('First name only')
  })
})

describe('publishProblem', () => {
  it('both consent ticks are needed before publishing', () => {
    expect(publishProblem({ consentClient: true, consentInstaller: true })).toBeNull()
    expect(publishProblem({ consentClient: false, consentInstaller: true })).toBe(
      'Tick both consents (client and installer) before publishing.',
    )
    expect(publishProblem({ consentClient: true, consentInstaller: false })).not.toBeNull()
  })
})

describe('partnerSchema', () => {
  it('a website is optional but must be a full web address', () => {
    expect(partnerSchema.safeParse({ name: 'SPEWA', websiteUrl: '' }).success).toBe(true)
    expect(partnerSchema.safeParse({ name: 'SPEWA', websiteUrl: 'https://spewa.ng' }).success).toBe(
      true,
    )
    expect(
      partnerSchema.safeParse({ name: 'SPEWA', websiteUrl: 'spewa.ng' }).error?.issues[0]?.message,
    ).toBe('Start the web address with https://')
  })
})

describe('moveInList (reorder buttons)', () => {
  it('moves one item up or down and leaves the ends alone', async () => {
    const { moveInList } = await import('./schemas')
    expect(moveInList(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(moveInList(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b'])
    expect(moveInList(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c'])
    expect(moveInList(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c'])
    expect(moveInList(['a', 'b'], 'zz', 'up')).toEqual(['a', 'b'])
  })
})
