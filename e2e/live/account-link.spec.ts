import { expect, test } from '@playwright/test'

import { hasDb, newPerson, throughAccount, throughDetails } from './helpers'

test('header and footer: "Sign in" → sign-in page → My account; signed in it says "My account"', async ({
  page,
}) => {
  test.skip(!hasDb, 'needs Supabase env')
  test.setTimeout(240_000)
  // A customer with an account (made through the normal quote journey), then signed out.
  const p = newPerson()
  await throughDetails(page, p)
  await throughAccount(page, p)
  await page.goto('/app')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL(/\/login/)

  await page.goto('/')
  const header = page.getByTestId('account-link-header')
  await expect(header).toHaveText('Sign in')
  await expect(page.getByTestId('account-link-footer')).toHaveText('Sign in')
  await header.click()
  await page.waitForURL(/\/login/)
  await page.getByLabel('Email').fill(p.email)
  await page.getByLabel('Password').fill('Solar-Plan-2026!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Lands on My account (an unfinished application sends them on to it from there).
  await page.waitForURL(/\/app(\/apply)?$/, { timeout: 45_000 })

  await page.goto('/')
  await expect(page.getByTestId('account-link-header')).toHaveText('My account')
  await expect(page.getByTestId('account-link-header')).toHaveAttribute('href', '/app')
})
