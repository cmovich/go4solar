import { describe, expect, it } from 'vitest'

import { PREVIEW_BANNER, isPreviewDeployment } from './preview'

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
})
