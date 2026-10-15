import { defineConfig, devices } from '@playwright/test'

/**
 * Live-mode end-to-end tests. Builds a separate copy of the app with
 * NEXT_PUBLIC_LAUNCH_MODE=live into .next-live and serves it on :3100, so .env.local can stay
 * on prelaunch and the prelaunch suite keeps its own build.
 */
const port = 3100
// Test-only secrets for guarantor links and ID hashes (the real ones live in .env.local / Vercel).
// The local-test-only- prefix means the app refuses them anywhere on Vercel.
const env = [
  'NEXT_DIST_DIR=.next-live',
  'NEXT_PUBLIC_LAUNCH_MODE=live',
  // The live suite always uses the mock payment provider, even if .env.local points at Paystack.
  'PAYMENTS_PROVIDER=mock',
  'GUARANTOR_TOKEN_SECRET=local-test-only-e2e-guarantor-0123456789',
  'ID_HASH_SECRET=local-test-only-e2e-id-hash-0123456789abcdef',
].join(' ')

export default defineConfig({
  testDir: './e2e/live',
  globalSetup: './e2e/global-setup.ts',
  // One at a time: each test makes many calls to the remote database and KYC mocks.
  workers: 1,
  // One retry for remote-database drops ("fetch failed"); failing twice is a real failure.
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 240_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    storageState: 'e2e/storage-state.json',
  },
  projects: [{ name: 'desktop-live', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `${env} npx next build && ${env} npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
