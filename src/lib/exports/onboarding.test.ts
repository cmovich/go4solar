import { describe, expect, it } from 'vitest'

import { onboardingLinkProblem, onboardingWhatsappHref, parseDomains } from './onboarding'

const tl = ['tradelenda.com']

describe('onboardingLinkProblem (only https links on the funder’s own domains)', () => {
  it('accepts https on the domain or a subdomain', () => {
    expect(onboardingLinkProblem('https://tradelenda.com/onboard/abc', tl)).toBeNull()
    expect(onboardingLinkProblem('https://app.tradelenda.com/start?ref=G4S-1', tl)).toBeNull()
  })

  it('refuses http, other domains, look-alikes, user:pass@ and junk', () => {
    expect(onboardingLinkProblem('http://tradelenda.com/x', tl)).toMatch(/https/)
    expect(onboardingLinkProblem('https://evil.com/tradelenda.com', tl)).toMatch(/tradelenda\.com/)
    expect(onboardingLinkProblem('https://tradelenda.com.evil.com/x', tl)).toMatch(
      /tradelenda\.com/,
    )
    expect(onboardingLinkProblem('https://nottradelenda.com/x', tl)).toMatch(/tradelenda\.com/)
    expect(onboardingLinkProblem('https://user:pw@tradelenda.com/x', tl)).toMatch(/not allowed/)
    expect(onboardingLinkProblem('not a link', tl)).toMatch(/full link/)
    expect(onboardingLinkProblem('javascript:alert(1)', tl)).toMatch(/https/)
  })

  it('no domains set for the funder: no link can be added', () => {
    expect(onboardingLinkProblem('https://tradelenda.com/x', [])).toMatch(/Admin → Funders/)
  })
})

describe('parseDomains (Admin → Funders)', () => {
  it('commas or spaces, lower case, no scheme or path; bad entries reported', () => {
    expect(parseDomains('TradeLenda.com, app.tradelenda.com')).toEqual({
      domains: ['tradelenda.com', 'app.tradelenda.com'],
      bad: [],
    })
    expect(parseDomains('https://spewa.org/x  bad_domain')).toEqual({
      domains: ['spewa.org'],
      bad: ['bad_domain'],
    })
    expect(parseDomains('')).toEqual({ domains: [], bad: [] })
  })
})

describe('onboardingWhatsappHref', () => {
  it('a wa.me link with the customer’s number and a pre-filled message naming the funder', () => {
    const href = onboardingWhatsappHref({
      phone: '+2348031234567',
      firstName: 'Ada',
      funderName: 'Trade Lenda',
      url: 'https://tradelenda.com/onboard/abc',
    })
    expect(href.startsWith('https://wa.me/2348031234567?text=')).toBe(true)
    const text = decodeURIComponent(href.split('?text=')[1]!)
    expect(text).toContain('Ada')
    expect(text).toContain('Trade Lenda')
    expect(text).toContain('https://tradelenda.com/onboard/abc')
  })
})
