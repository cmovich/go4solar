/**
 * Security headers (CLAUDE.md section 7). The browser may talk only to our own site, Supabase,
 * Paystack (checkout redirect / inline script and frame) and QoreID's liveness SDK. The Anthropic
 * API is server-side only and is deliberately absent.
 * 'unsafe-inline' scripts: Next.js inlines its hydration data; a nonce-based CSP needs every page
 * rendered per request (the landing page is static), so it is a later step.
 * VERIFY the QoreID SDK hosts against the QoreID account before going live with qoreid.
 */
const PAYSTACK_SCRIPT = 'https://js.paystack.co'
const PAYSTACK_FRAMES = ['https://checkout.paystack.com', 'https://js.paystack.co']
const PAYSTACK_API = 'https://api.paystack.co'
const QOREID = 'https://*.qoreid.com'

export function contentSecurityPolicy(o: { supabaseUrl: string; dev: boolean }): string {
  const supabase = o.supabaseUrl.replace(/\/$/, '')
  const supabaseWs = supabase.replace(/^https:/, 'wss:')
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${PAYSTACK_SCRIPT} ${QOREID}${o.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseWs} ${PAYSTACK_API} ${QOREID}${o.dev ? ' ws:' : ''}`,
    `frame-src ${PAYSTACK_FRAMES.join(' ')} ${QOREID}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // No upgrade-insecure-requests: Vercel serves HTTPS only and HSTS pins it; the directive would
    // break local production builds on http://localhost (e2e).
  ].join('; ')
}

type HeaderRule = { source: string; headers: { key: string; value: string }[] }

const permissions = (camera: string, geolocation: string) =>
  `camera=${camera}, microphone=(), geolocation=${geolocation}, payment=(), usb=(), interest-cohort=()`

export function securityHeaders(o: { supabaseUrl: string; dev: boolean }): HeaderRule[] {
  const liveness = `(self "${QOREID}")`
  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy(o) },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: permissions('()', '()') },
      ],
    },
    // Liveness (face check) happens in the application wizard and on the guarantor link; the map
    // pin in the wizard may use the device location. Later rules override earlier ones.
    {
      source: '/app/apply',
      headers: [{ key: 'Permissions-Policy', value: permissions(liveness, '(self)') }],
    },
    {
      source: '/guarantee/:path*',
      headers: [{ key: 'Permissions-Policy', value: permissions(liveness, '()') }],
    },
  ]
}
