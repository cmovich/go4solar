import { describe, expect, it } from 'vitest'

import { originFor } from './origin'

const preview = new Headers({
  'x-forwarded-host': 'go4solar-git-phase-1-moses-semakos-projects.vercel.app',
  'x-forwarded-proto': 'https',
})

describe('originFor (links in messages use the site the app is running on)', () => {
  it('preview: the preview address, even when NEXT_PUBLIC_SITE_URL is go4solar.app', () => {
    expect(
      originFor(preview, { VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: 'https://go4solar.app' }),
    ).toBe('https://go4solar-git-phase-1-moses-semakos-projects.vercel.app')
  })

  it('production: NEXT_PUBLIC_SITE_URL (without a trailing slash)', () => {
    expect(
      originFor(preview, {
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://go4solar.app/',
      }),
    ).toBe('https://go4solar.app')
  })

  it("production without NEXT_PUBLIC_SITE_URL: Vercel's production domain", () => {
    expect(
      originFor(preview, {
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'go4solar.app',
      }),
    ).toBe('https://go4solar.app')
  })

  it('local: the request host over http', () => {
    expect(originFor(new Headers({ host: 'localhost:3000' }), {})).toBe('http://localhost:3000')
  })
})
