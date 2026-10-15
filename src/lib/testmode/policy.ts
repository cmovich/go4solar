import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Where the code is running. Vercel sets VERCEL_ENV on its deployments; anything else (your
 * computer, the Playwright builds) is "local".
 */
export type DeployEnv = 'production' | 'preview' | 'local'

export function deployEnv(env: Record<string, string | undefined> = process.env): DeployEnv {
  if (env.VERCEL_ENV === 'production') return 'production'
  if (env.VERCEL_ENV === 'preview') return 'preview'
  return 'local'
}

const MIN_SECRET = 16
export const TEST_MODE_COOKIE = 'g4s_test_mode'

/** The value the unlock cookie must hold: a keyed hash of TEST_MODE_SECRET (never the secret). */
export function unlockToken(secret: string): string {
  return createHmac('sha256', secret).update('go4solar-test-mode').digest('hex')
}

/**
 * Test-only switches ("?test=1" to show test data, the mock checkout / bank pages):
 * never in production; on previews only after unlocking with TEST_MODE_SECRET; always locally.
 */
export function testSwitchesAllowed(o: {
  env: DeployEnv
  secret: string | undefined
  cookie: string | null | undefined
}): boolean {
  if (o.env === 'production') return false
  if (o.env === 'local') return true
  if (!o.secret || o.secret.length < MIN_SECRET || !o.cookie) return false
  const want = Buffer.from(unlockToken(o.secret))
  const got = Buffer.from(o.cookie)
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Mock KYC / payments / messaging / vision: never in production (fail closed instead). */
export function mockProvidersAllowed(env: DeployEnv): boolean {
  return env !== 'production'
}

export class MockInProductionError extends Error {
  constructor(provider: string) {
    super(
      `${provider}: the mock provider is disabled in production. Set the real provider in the environment.`,
    )
    this.name = 'MockInProductionError'
  }
}
