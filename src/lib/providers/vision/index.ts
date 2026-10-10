import type { VisionResult } from './schema'

export type { VisionResult } from './schema'

/** Reads an appliance's rating label (or estimates from its appearance). */
export type VisionProvider = {
  name: 'mock' | 'anthropic'
  estimateWatts(image: Blob): Promise<VisionResult>
}

/** Picks the adapter from VISION_PROVIDER (mock by default, so the site runs without a key). */
export async function getVisionProvider(): Promise<VisionProvider> {
  if (process.env.VISION_PROVIDER === 'anthropic') {
    const { anthropicVisionProvider } = await import('./anthropic')
    return anthropicVisionProvider
  }
  const { mockVisionProvider } = await import('./mock')
  return mockVisionProvider
}
