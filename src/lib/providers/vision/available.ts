import { deployEnv, mockProvidersAllowed } from '@/lib/testmode/policy'

/**
 * Whether the "snap the label" watts lookup can run: the Anthropic adapter with a key, or the mock
 * (previews and local runs only). When false the calculator hides the button and the API answers 404.
 */
export function photoLookupAvailable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.VISION_PROVIDER === 'anthropic') return Boolean(env.ANTHROPIC_API_KEY)
  return mockProvidersAllowed(deployEnv(env))
}
