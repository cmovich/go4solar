import { describe, expect, it } from 'vitest'

import { PREVIEW_BANNER, STAGING_BANNER, isPreviewDeployment, previewBanner } from './preview'

const LIVE = 'https://moqcgqrcmtzovsmtwkna.supabase.co'
const STAGING = 'https://abcdefghijklmnopqrst.supabase.co'

describe('preview banner (admin pages)', () => {
  it('only on Vercel preview deployments', () => {
    expect(isPreviewDeployment({ VERCEL_ENV: 'preview' })).toBe(true)
    expect(isPreviewDeployment({ VERCEL_ENV: 'production' })).toBe(false)
    expect(isPreviewDeployment({})).toBe(false)
  })
  it('says the database is live', () => {
    expect(PREVIEW_BANNER).toBe(
      'PREVIEW — this uses the LIVE database. Exports, ticks and edits are real.',
    )
  })
  it('red on a preview using the live database (or an unknown one), calm on staging, none in production', () => {
    expect(previewBanner({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: LIVE })).toEqual({
      tone: 'live',
      text: PREVIEW_BANNER,
    })
    expect(previewBanner({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: '' })?.tone).toBe(
      'live',
    )
    expect(previewBanner({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SUPABASE_URL: STAGING })).toEqual({
      tone: 'staging',
      text: STAGING_BANNER,
    })
    expect(previewBanner({ VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: LIVE })).toBeNull()
  })
})
