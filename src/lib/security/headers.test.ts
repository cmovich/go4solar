import { describe, expect, it } from 'vitest'

import { contentSecurityPolicy, securityHeaders } from './headers'

const SUPABASE = 'https://abcd1234.supabase.co'

describe('content security policy', () => {
  const csp = contentSecurityPolicy({ supabaseUrl: SUPABASE, dev: false })
  const directive = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

  it('allows only our site, Supabase, Paystack and the liveness provider', () => {
    expect(directive('default-src')).toBe("default-src 'self'")
    expect(directive('connect-src')).toContain(SUPABASE)
    expect(directive('script-src')).toContain('https://js.paystack.co')
    expect(directive('frame-src')).toContain('https://checkout.paystack.com')
    expect(directive('frame-src')).toContain('https://*.qoreid.com')
  })

  it('the Anthropic API is called from the server only, never from the browser', () => {
    expect(csp).not.toMatch(/anthropic/i)
  })

  it('no framing of our pages, no plugins, no foreign base URL', () => {
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('eval only in development', () => {
    expect(directive('script-src')).not.toContain("'unsafe-eval'")
    expect(contentSecurityPolicy({ supabaseUrl: SUPABASE, dev: true })).toContain("'unsafe-eval'")
  })
})

describe('security headers by route', () => {
  const rules = securityHeaders({ supabaseUrl: SUPABASE, dev: false })
  const headersFor = (path: string) => {
    const out: Record<string, string> = {}
    for (const r of rules) {
      const re = new RegExp(`^${r.source.replace(/:path\*/g, '.*').replace(/\(\.\*\)/g, '.*')}$`)
      if (re.test(path)) for (const h of r.headers) out[h.key] = h.value
    }
    return out
  }

  it('every page: HSTS, frame denial, referrer policy, nosniff, no camera', () => {
    const h = headersFor('/')
    expect(h['Strict-Transport-Security']).toMatch(/max-age=\d{8}/)
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Permissions-Policy']).toContain('camera=()')
  })

  it('camera only on the liveness pages (application wizard, guarantor link)', () => {
    expect(headersFor('/app/apply')['Permissions-Policy']).toContain('camera=(self')
    expect(headersFor('/guarantee/abc')['Permissions-Policy']).toContain('camera=(self')
    expect(headersFor('/app')['Permissions-Policy']).toContain('camera=()')
    expect(headersFor('/admin/applications')['Permissions-Policy']).toContain('camera=()')
  })
})
