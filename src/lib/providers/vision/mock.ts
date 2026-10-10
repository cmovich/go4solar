import type { VisionProvider } from './index'

const MOCK_DELAY_MS = 1200

/** Behaves like a real lookup (short delay) and always finds a 150 W refrigerator label. */
export const mockVisionProvider: VisionProvider = {
  name: 'mock',
  async estimateWatts() {
    await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS))
    return { watts: 150, method: 'label', appliance: 'Refrigerator' }
  },
}
