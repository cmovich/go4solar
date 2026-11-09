import { expect, type Page } from '@playwright/test'

import { buildFromLoad } from './builder'

/** True once migration 0032 (staff quotations) is applied. */
export async function staffQuotesMigrated(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/staff_quotations?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok
}

/**
 * Admin → New quotation (signed in as staff): customer box, then the builder exactly as customers
 * use it, then "Create quotation". Returns the admin page address and the customer link.
 */
export async function createQuotationAsStaff(
  page: Page,
  customer: { name: string; phone: string },
): Promise<{ adminUrl: string; link: string }> {
  await page.goto('/admin/quotations')
  await page.getByTestId('new-quotation').click()
  await expect(page.getByRole('heading', { name: 'New quotation' })).toBeVisible()
  // The builder asks for the state at the top (customer box), not in its first step.
  await expect(page.getByLabel('Where will it be installed?')).toBeHidden()
  await page.getByRole('button', { name: /^A complete system/ }).click()
  await expect(page.getByText("Choose the customer's state at the top first.")).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill(customer.name)
  await page.getByLabel('Phone', { exact: true }).fill(customer.phone)
  await page.getByLabel('State', { exact: true }).selectOption('Lagos')
  await page.getByRole('button', { name: /^A complete system/ }).click()
  await buildFromLoad(page)
  // Staff never type the customer's details or tick consent for them.
  await expect(page.getByRole('heading', { name: 'Your details' })).toHaveCount(0)
  await page.getByTestId('create-quotation').click()
  await page.waitForURL(/\/admin\/quotations\/[0-9a-f-]{36}$/, { timeout: 45_000 })
  await expect(page.getByTestId('quotation-status')).toContainText('Not shared yet')
  const link = (await page.getByTestId('customer-link').getAttribute('href'))!
  expect(link).toMatch(/\/q\/[a-z0-9]{12}$/)
  return { adminUrl: page.url(), link }
}
