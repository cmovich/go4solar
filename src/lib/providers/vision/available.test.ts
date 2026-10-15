import { describe, expect, it } from 'vitest'

import { photoLookupAvailable } from './available'

// Prompt 16A: hide the AI photo lookup when there is no vision key (never the mock in production).
describe('photoLookupAvailable', () => {
  it('production: only with the Anthropic provider and a key', () => {
    expect(photoLookupAvailable({ VERCEL_ENV: 'production' })).toBe(false)
    expect(photoLookupAvailable({ VERCEL_ENV: 'production', VISION_PROVIDER: 'anthropic' })).toBe(
      false,
    )
    expect(
      photoLookupAvailable({
        VERCEL_ENV: 'production',
        VISION_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-x',
      }),
    ).toBe(true)
  })

  it('previews and local runs: the mock is allowed', () => {
    expect(photoLookupAvailable({ VERCEL_ENV: 'preview' })).toBe(true)
    expect(photoLookupAvailable({})).toBe(true)
  })
})
