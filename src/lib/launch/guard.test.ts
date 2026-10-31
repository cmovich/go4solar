import { describe, expect, it } from 'vitest'

import { prelaunchBlock } from './guard'

describe('prelaunchBlock (live-only routes are closed while NEXT_PUBLIC_LAUNCH_MODE=prelaunch)', () => {
  it('lets the prelaunch site, staff pages and crons through', () => {
    for (const p of [
      '/',
      '/calculate',
      '/waitlist',
      '/privacy',
      '/terms',
      '/login',
      '/partners/installer',
      '/admin',
      '/admin/waitlist',
      '/admin/mfa',
      '/api/admin/waitlist/export.csv',
      '/api/cron/reminders',
      '/api/vision/watts',
      '/auth/confirm',
    ]) {
      expect(prelaunchBlock(p, 'prelaunch'), p).toBeNull()
    }
  })

  it('sends /get-started to the prelaunch sign-up', () => {
    expect(prelaunchBlock('/get-started', 'prelaunch')).toEqual({ redirect: '/waitlist' })
  })

  it('sends every live-only page home', () => {
    for (const p of [
      '/plans',
      '/account',
      '/app',
      '/app/apply',
      '/app/apply/sign',
      '/app/apply/pay',
      '/app/apply/pay/return',
      '/app/pay/mock',
      '/app/pay/mock-mandate',
      '/guarantee/abc123',
      '/verify-email',
      '/test-mode',
      '/partners/vendor',
    ]) {
      expect(prelaunchBlock(p, 'prelaunch'), p).toEqual({ redirect: '/' })
    }
  })

  it('answers 404 for the payment webhook', () => {
    expect(prelaunchBlock('/api/webhooks/paystack', 'prelaunch')).toEqual({ notFound: true })
  })

  it('does not match look-alike paths', () => {
    expect(prelaunchBlock('/applications', 'prelaunch')).toBeNull()
    expect(prelaunchBlock('/plansx', 'prelaunch')).toBeNull()
  })

  it('in live mode nothing is blocked', () => {
    for (const p of ['/plans', '/app/apply', '/guarantee/x', '/get-started', '/test-mode']) {
      expect(prelaunchBlock(p, 'live'), p).toBeNull()
    }
  })
})

describe('prelaunch redirect keeps the query', () => {
  it('/get-started?from=calculate → /waitlist?from=calculate (appliances carry over)', async () => {
    const { redirectTarget } = await import('./guard')
    expect(redirectTarget('/waitlist', '?from=calculate')).toBe('/waitlist?from=calculate')
    expect(redirectTarget('/', '?x=1')).toBe('/')
  })
})

describe('the builder (Part F)', () => {
  it('/build is open in both modes', () => {
    expect(prelaunchBlock('/build', 'prelaunch')).toBeNull()
    expect(prelaunchBlock('/build', 'live')).toBeNull()
  })
})
