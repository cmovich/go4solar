import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { expect, test, type Page } from '@playwright/test'

import { testEmail } from './helpers/test-identity'
import { totp } from './helpers/totp'

config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Staff invite and "Forgot password?": email link → /auth/callback → "Set your password" →
 * /admin/mfa → /admin. The links come from Supabase's generateLink (the same link the email
 * holds) so no email is sent. Test identities only (flagged is_test); nothing is deleted.
 */
test.describe('invite and password links', () => {
  test.skip(!url || !service, 'needs Supabase env')
  test.skip(({ isMobile }) => isMobile, 'one browser is enough')

  const admin = () => createClient(url!, service!, { auth: { persistSession: false } })
  const password = `a long test password ${Date.now()}`

  async function setPasswordScreen(page: Page) {
    await page.waitForURL(/\/set-password$/, { timeout: 30000 })
    await expect(page.getByText('Set your password', { exact: true })).toBeVisible()
    await page.getByLabel('New password').fill('too short')
    await page.getByLabel('Type it again').fill('too short')
    await page.getByRole('button', { name: 'Save my password' }).click()
    await expect(page.getByText('Use at least 12 characters', { exact: true })).toBeVisible()
    await page.getByLabel('New password').fill(password)
    await page.getByLabel('Type it again').fill(`${password}!`)
    await page.getByRole('button', { name: 'Save my password' }).click()
    await expect(
      page.getByText('The two passwords are not the same', { exact: true }),
    ).toBeVisible()
    await page.getByLabel('Type it again').fill(password)
    await page.getByRole('button', { name: 'Save my password' }).click()
  }

  test('invite → set password → authenticator → /admin; the link works only once', async ({
    page,
    browser,
    baseURL,
  }) => {
    const email = testEmail('invite')
    const { data, error } = await admin().auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${baseURL}/auth/callback`, data: { full_name: 'E2E Invitee' } },
    })
    if (error) throw error
    await admin().from('profiles').update({ role: 'operations' }).eq('id', data.user.id)
    const link = data.properties.action_link

    await page.goto(link)
    await setPasswordScreen(page)

    // Authenticator set-up, then the back office.
    await page.waitForURL(/\/admin\/mfa$/, { timeout: 30000 })
    const key = page.getByText(/Enter this key by hand/).locator('span')
    await expect(key).toBeVisible({ timeout: 30000 })
    await page.getByLabel('6-digit code').fill(totp((await key.textContent())!.trim()))
    await page.getByRole('button', { name: 'Finish setup' }).click()
    await page.waitForURL((u) => u.pathname === '/admin', { timeout: 30000 })

    // The new password signs in (fresh browser, no session).
    const fresh = await browser.newPage({ storageState: { cookies: [], origins: [] } })
    await fresh.goto('/login')
    await fresh.getByLabel('Email').fill(email)
    await fresh.getByLabel('Password').fill(password)
    await fresh.getByRole('button', { name: 'Sign in' }).click()
    await fresh.waitForURL(/\/admin\/mfa/, { timeout: 30000 })

    // The same link a second time: a clear message and a way to get a new one.
    const again = await browser.newPage({ storageState: { cookies: [], origins: [] } })
    await again.goto(link)
    await expect(again.getByTestId('link-expired')).toBeVisible({ timeout: 30000 })
    await again.getByRole('link', { name: 'Get a new link' }).click()
    await again.waitForURL(/\/forgot-password$/)
  })

  test('Forgot password? on /login → link → set a new password', async ({ page, baseURL }) => {
    // The form: same answer for any email (this one has no account, so nothing is sent).
    await page.goto('/login')
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await page.waitForURL(/\/forgot-password$/)
    await page.getByLabel('Email').fill(testEmail('no-account'))
    await page.getByRole('button', { name: 'Send me a link' }).click()
    await expect(page.getByTestId('link-sent')).toContainText('we have sent it a link')

    // The emailed link (same as Supabase sends) for an existing staff account.
    const email = testEmail('forgot')
    const { data: created, error: createError } = await admin().auth.admin.createUser({
      email,
      password: `old password ${Date.now()}`,
      email_confirm: true,
    })
    if (createError) throw createError
    await admin().from('profiles').update({ role: 'finance' }).eq('id', created.user.id)
    const { data, error } = await admin().auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${baseURL}/auth/callback` },
    })
    if (error) throw error
    await page.goto(data.properties.action_link)
    await setPasswordScreen(page)
    await page.waitForURL(/\/admin\/mfa$/, { timeout: 30000 })
  })

  test('/set-password without an emailed link shows how to get one', async ({ browser }) => {
    const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })
    await page.goto('/set-password')
    await expect(page.getByTestId('link-expired')).toBeVisible()
    await page.goto('/auth/callback')
    await expect(page.getByTestId('link-expired')).toBeVisible()
  })

  test('a normal password sign-in cannot change the password there', async ({ browser }) => {
    const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.E2E_STAFF_EMAIL!)
    await page.getByLabel('Password').fill(process.env.E2E_STAFF_PASSWORD!)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/admin/, { timeout: 30000 })
    await page.goto('/set-password')
    await expect(page.getByTestId('link-expired')).toBeVisible()
    await expect(page.getByLabel('New password')).toHaveCount(0)
  })
})
