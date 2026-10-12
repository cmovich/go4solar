import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { expect, test } from '@playwright/test'

import { testEmail } from './helpers/test-identity'

config({ path: '.env.local', quiet: true })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

// A staff account without an authenticator must set one up before reaching anything in /admin.
// The account uses a test identity (flagged is_test) and is left in place (no deletions).
test.describe('admin two-factor', () => {
  test.skip(!url || !service, 'needs Supabase env')
  test.skip(({ isMobile }) => isMobile, 'one browser is enough')

  test('staff without TOTP are sent to set it up, and cannot reach /admin', async ({ page }) => {
    const admin = createClient(url!, service!, { auth: { persistSession: false } })
    const email = testEmail('staff-nomfa')
    const password = `NoMfa-${Date.now()}-Aa1!`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    await admin.from('profiles').update({ role: 'operations' }).eq('id', data.user.id)

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/admin\/mfa/, { timeout: 30000 })
    await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible({
      timeout: 30000,
    })

    for (const path of ['/admin', '/admin/applications', '/admin/jobs']) {
      await page.goto(path)
      await page.waitForURL(/\/admin\/mfa/)
    }
  })

  test('the cookie notice shows once and can be dismissed with the keyboard', async ({
    browser,
  }) => {
    // A brand-new visitor: no saved state, so the notice must show.
    const fresh = await browser.newPage({ storageState: { cookies: [], origins: [] } })
    await fresh.goto('/privacy')
    await expect(fresh.getByTestId('legal-draft')).toHaveText('DRAFT – pending legal review')
    const notice = fresh.getByTestId('cookie-notice')
    await expect(notice).toContainText('essential cookies only')
    await notice.getByRole('button', { name: 'OK' }).focus()
    await fresh.keyboard.press('Enter')
    await expect(notice).toHaveCount(0)
    await fresh.reload()
    await expect(fresh.getByTestId('cookie-notice')).toHaveCount(0)
    await fresh.goto('/terms')
    await expect(fresh.getByTestId('legal-draft')).toBeVisible()
    await fresh.close()
  })
})
