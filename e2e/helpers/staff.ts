import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { totp } from './totp'

type Cookie = Awaited<ReturnType<BrowserContext['cookies']>>[number]

/**
 * An authenticator code works only once per 30 s window PER ACCOUNT. Each sign-in reserves a
 * window for its account with a lock file (created atomically, shared by both suites); if this
 * window is taken, or too little of it is left to submit, wait for the next one.
 */
async function freshCode(secret: string): Promise<string> {
  const account = secret.slice(0, 8)
  for (;;) {
    const window = Math.floor(Date.now() / 30_000)
    const secondsLeft = 30 - Math.floor((Date.now() / 1000) % 30)
    // Leave time to submit inside the same window (Supabase rejects a code older than the last one used).
    if (secondsLeft >= 20) {
      try {
        closeSync(openSync(path.join(tmpdir(), `g4s-e2e-totp-${account}-${window}`), 'wx'))
        return totp(secret)
      } catch {
        // Taken by another test signing in as the same account: wait for the next window.
      }
    }
    await new Promise((r) => setTimeout(r, secondsLeft * 1000 + 500))
  }
}

type Who = 'staff' | 'ops' | 'sales' | 'spewa'
const sessionFile = (who: Who) => path.join(tmpdir(), `g4s-e2e-session-${who}.json`)
const SESSION_MAX_AGE_MS = 30 * 60_000

/** Where each account lands after signing in (the only page Sales / the SPEWA approver may use). */
function landingFor(who: Who): readonly [RegExp, string] {
  if (who === 'sales') return [/\/admin\/quotations$/, 'Quotations']
  if (who === 'spewa') return [/\/admin\/spewa$/, 'SPEWA approvals']
  return [/\/admin$/, 'Back office']
}
const LANDING_PATH: Record<Who, string> = {
  staff: '/admin',
  ops: '/admin',
  sales: '/admin/quotations',
  spewa: '/admin/spewa',
}

/**
 * Reuse a session this account signed in with (two-factor) earlier in the run, so tests do not
 * each need a fresh authenticator window. True when it still lands on the back office.
 */
async function reuseSession(page: Page, who: Who): Promise<boolean> {
  const file = sessionFile(who)
  if (!existsSync(file) || Date.now() - statSync(file).mtimeMs > SESSION_MAX_AGE_MS) return false
  try {
    const cookies = JSON.parse(readFileSync(file, 'utf8')) as Cookie[]
    await page.context().addCookies(cookies)
    await page.goto(LANDING_PATH[who])
    const [to, heading] = landingFor(who)
    if (!to.test(new URL(page.url()).pathname)) return false
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
      timeout: 15_000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Signs in as an e2e staff member made by global-setup, with the authenticator:
 * 'staff' = super admin (default), 'ops' = operations role with no extra permissions, 'sales' =
 * the Sales role (Quotations only; from migration 0033), 'spewa' = the funder approver (SPEWA
 * approvals only; from migration 0038). Reuses this run's session for the account when it still
 * works; otherwise signs in, retrying a refused code in the next free window (up to 3 times).
 */
export async function loginAsStaff(page: Page, who: Who = 'staff') {
  test.setTimeout(Math.max(test.info().timeout, 300_000))
  if (await reuseSession(page, who)) return
  // One sign-in per account at a time: the first test signs in, the others wait for its saved
  // session (parallel two-factor checks are refused by Supabase).
  const lock = path.join(tmpdir(), `g4s-e2e-login-${who}.lock`)
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx'))
      break
    } catch {
      // Someone else is signing in as this account (a lock older than 3 minutes is stale).
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 180_000) {
        rmSync(lock, { force: true })
        continue
      }
      await new Promise((r) => setTimeout(r, 2_000))
      if (await reuseSession(page, who)) return
    }
  }
  try {
    await signIn(page, who)
  } finally {
    rmSync(lock, { force: true })
  }
}

async function signIn(page: Page, who: Who) {
  const env = { staff: 'E2E_STAFF', ops: 'E2E_OPS', sales: 'E2E_SALES', spewa: 'E2E_SPEWA' }[who]
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env[`${env}_EMAIL`]!)
  await page.getByLabel('Password').fill(process.env[`${env}_PASSWORD`]!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/admin\/mfa/)
  const [to, heading] = landingFor(who)
  for (let attempt = 1; ; attempt++) {
    await page.getByLabel('6-digit code').fill(await freshCode(process.env[`${env}_TOTP_SECRET`]!))
    await page.getByRole('button', { name: 'Verify' }).click()
    const outcome = await Promise.race([
      page.waitForURL(to, { timeout: 45_000 }).then(() => 'in' as const),
      page
        .getByText('That code did not work')
        .waitFor({ timeout: 45_000 })
        .then(() => 'refused' as const),
    ])
    if (outcome === 'in') break
    if (attempt >= 3) throw new Error('the authenticator code was refused 3 times')
  }
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
    timeout: 30_000,
  })
  writeFileSync(sessionFile(who), JSON.stringify(await page.context().cookies()))
}
