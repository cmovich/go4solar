import { p70 } from '@/lib/vision/spend'

import type { VisionProvider } from './index'

const MOCK_DELAY_MS = 1200

/**
 * Behaves like a real lookup (short delay, small token counts): a label photo reads a 150 W
 * refrigerator label; an appliance photo estimates a standing fan at 100–200 W (sized at 170 W).
 */
export const mockVisionProvider: VisionProvider = {
  name: 'mock',
  async lookup(_image, kind) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
    const usage = { inputTokens: 1500, outputTokens: 60, webSearches: 0 }
    if (kind === 'label') {
      return { result: { watts: 150, method: 'label', appliance: 'Refrigerator' }, usage }
    }
    return {
      result: {
        watts: p70(100, 200),
        method: 'estimate',
        low: 100,
        high: 200,
        appliance: 'Standing fan',
      },
      usage,
    }
  },
}
