import { defineConfig, devices } from '@playwright/test'

const port = 3000
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  // Live-mode specs need their own build: see playwright.live.config.ts.
  testIgnore: '**/live/**',
  // Creates the staff test user (with MFA) used by the admin tests; no-op without Supabase env.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // One retry: the remote database sometimes drops a request ("fetch failed"). A test that
  // fails twice is a real failure. See CLAUDE.md section 12.
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Cookie notice already dismissed (one test checks the notice itself).
    storageState: 'e2e/storage-state.json',
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // When E2E_BASE_URL is set (e.g. a Vercel preview) no local server is started.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
