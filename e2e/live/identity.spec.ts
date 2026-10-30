import { expect, test } from '@playwright/test'

import { newPerson, throughAccount, throughDetails } from './helpers'

// Bug (a), 30 Oct: a browser still signed in as an earlier applicant must never carry a new
// person's quote into that applicant's account, ID checks or agreement.
test('a new quote while signed in as someone else asks who is applying', async ({ page }) => {
  test.setTimeout(240_000)
  const first = newPerson('individual', { firstName: 'Moses', surname: 'Donatus' })
  await throughDetails(page, first)
  await throughAccount(page, first) // now signed in as Moses Donatus

  const second = newPerson('individual', { firstName: 'Love', surname: 'Lounge' })
  await throughDetails(page, second)
  await page.getByRole('button', { name: 'Choose Comfort' }).click()
  await page.waitForURL(/\/account\?quote=/)
  const quoteUrl = page.url()

  // The question, not the phone code.
  const choice = page.getByTestId('identity-choice')
  await expect(choice).toContainText(
    "You're signed in as Moses Donatus. Continue as Moses Donatus, or sign out to apply as someone else.",
  )
  await expect(page.getByLabel('6-digit code')).toHaveCount(0)

  // "Continue as Moses": the code goes to Moses's own phone, never Love's.
  await choice.getByRole('link', { name: 'Continue as Moses Donatus' }).click()
  await expect(page.getByRole('heading', { name: 'Confirm your phone' })).toBeVisible()
  const mosesLocal = first.phone.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3')
  await expect(page.getByText(mosesLocal)).toBeVisible()

  // Back to the plain link: sign out to apply as Love → Love creates her own account.
  await page.goto(quoteUrl)
  await page.getByRole('button', { name: 'Sign out and apply as Love' }).click()
  await expect(page.getByRole('heading', { name: 'Create your account, Love' })).toBeVisible({
    timeout: 30_000,
  })
})
