import { openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { totp } from './totp'

/**
 * An authenticator code works only once per 30 s window, and several tests sign in as the same
 * staff member in parallel. Each sign-in reserves a window with a lock file (created atomically);
 * if this window is taken, wait for the next one.
 */
async function freshCode(secret: string): Promise<string> {
  for (;;) {
    const window = Math.floor(Date.now() / 30_000)
    const secondsLeft = 30 - Math.floor((Date.now() / 1000) % 30)
    // Leave time to submit inside the same window (Supabase rejects a code older than the last one used).
    if (secondsLeft >= 20) {
      try {
        closeSync(openSync(path.join(tmpdir(), `g4s-e2e-totp-${window}`), 'wx'))
        return totp(secret)
      } catch {
        // Taken by another test: wait for the next window.
      }
    }
    await new Promise((r) => setTimeout(r, secondsLeft * 1000 + 500))
  }
}

/** Signs in as the e2e staff member (super admin, made by global-setup) with the authenticator. */
export async function loginAsStaff(page: Page) {
  test.setTimeout(Math.max(test.info().timeout, 300_000))
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_STAFF_EMAIL!)
  await page.getByLabel('Password').fill(process.env.E2E_STAFF_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/admin\/mfa/)
  await page.getByLabel('6-digit code').fill(await freshCode(process.env.E2E_STAFF_TOTP_SECRET!))
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.waitForURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'Back office' })).toBeVisible()
}
