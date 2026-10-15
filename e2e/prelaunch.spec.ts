import { expect, test } from '@playwright/test'

// Prompt 16A: with NEXT_PUBLIC_LAUNCH_MODE=prelaunch only the waiting list and staff pages are open.
test.describe('prelaunch: live-only routes are closed', () => {
  for (const path of [
    '/plans',
    '/account',
    '/app',
    '/app/apply',
    '/app/apply/sign',
    '/app/apply/pay',
    '/app/pay/mock',
    '/guarantee/abc',
    '/verify-email',
    '/test-mode',
    '/partners/vendor',
  ]) {
    test(`${path} goes home`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/$/)
    })
  }

  test('/get-started opens the sign-up', async ({ page }) => {
    await page.goto('/get-started')
    await expect(page).toHaveURL(/\/waitlist$/)
  })

  test('the payment webhook answers 404', async ({ request }) => {
    expect((await request.post('/api/webhooks/paystack', { data: {} })).status()).toBe(404)
  })

  test('/login is staff sign-in only', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create an account' })).toHaveCount(0)
  })

  test('the installer sign-up stays open', async ({ page }) => {
    await page.goto('/partners/installer')
    await expect(page).toHaveURL(/\/partners\/installer$/)
  })
})
