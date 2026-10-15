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

  // No strip at the top and no "7 days" promise anywhere before the sign-up is complete.
  for (const path of [
    '/',
    '/calculate',
    '/waitlist',
    '/partners/installer',
    '/privacy',
    '/terms',
  ]) {
    test(`${path} has no prelaunch strip and no 7-day promise`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByText(/^Prelaunch:/)).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText(/within (the next )?7 days/i)
      await expect(page.locator('body')).not.toContainText(/waiting list/i)
      const description = await page.locator('meta[name="description"]').getAttribute('content')
      expect(description ?? '').not.toMatch(/7 days/i)
    })
  }
})

// Fix-up 1 #1 in prelaunch: the calculator must not be shown twice on go4solar.app.
test('calculator → "See my solar plans" continues at the total load (no second calculator)', async ({
  page,
}) => {
  await page.goto('/calculate')
  await page.getByRole('button', { name: 'Lighting' }).click()
  await page.getByRole('button', { name: /^LED bulb/ }).click()
  await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
  await page.getByRole('button', { name: /^Fridge/ }).click()
  await page.getByRole('link', { name: 'See my solar plans' }).click()
  await page.waitForURL(/\/waitlist\?from=calculate$/)
  await expect(page.getByRole('heading', { name: 'Your total load' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Calculate your load' })).toHaveCount(0)
  await expect(page.getByText('2 appliances on your list.')).toBeVisible()
  // Back to my appliances returns to /calculate with the list kept.
  await page.getByRole('button', { name: 'Back to my appliances' }).click()
  await page.waitForURL(/\/calculate$/)
  await expect(page.getByRole('link', { name: 'See my solar plans' })).toBeVisible()
})

test('/get-started?from=calculate also lands on the total load (query kept on redirect)', async ({
  page,
}) => {
  await page.goto('/calculate')
  await page.getByRole('button', { name: 'Lighting' }).click()
  await page.getByRole('button', { name: /^LED bulb/ }).click()
  await page.goto('/get-started?from=calculate')
  await page.waitForURL(/\/waitlist\?from=calculate$/)
  await expect(page.getByRole('heading', { name: 'Your total load' })).toBeVisible()
})
