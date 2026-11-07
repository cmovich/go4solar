import type { VisionResult } from './schema'
import type { LookupUsage } from '@/lib/vision/spend'
import { MockInProductionError, deployEnv, mockProvidersAllowed } from '@/lib/testmode/policy'

export type { VisionResult } from './schema'

/** "label": a photo of the rating label. "item": a photo of the appliance itself. */
export type PhotoKind = 'label' | 'item'

export type LookupOutcome = { result: VisionResult; usage: LookupUsage }

/** Reads an appliance's rating label, or estimates its watts from a photo of the appliance. */
export type VisionProvider = {
  name: 'mock' | 'anthropic'
  lookup(image: Blob, kind: PhotoKind): Promise<LookupOutcome>
}

/** Picks the adapter from VISION_PROVIDER (mock by default, so the site runs without a key). */
export async function getVisionProvider(): Promise<VisionProvider> {
  if (process.env.VISION_PROVIDER === 'anthropic') {
    const { anthropicVisionProvider } = await import('./anthropic')
    return anthropicVisionProvider
  }
  if (!mockProvidersAllowed(deployEnv())) throw new MockInProductionError('Vision')
  const { mockVisionProvider } = await import('./mock')
  return mockVisionProvider
}
