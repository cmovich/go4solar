import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** True once migration 0028 (invoices) is applied. */
export async function invoicesMigrated(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/invoices?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok
}

/**
 * Downloads an invoice link and checks it is a PDF with an invoice number; returns the verify
 * link printed in it (found from the invoices table by number, as the PDF text is compressed).
 */
export async function downloadInvoice(request: APIRequestContext, href: string) {
  const res = await request.get(href)
  expect(res.status(), await res.text().catch(() => '')).toBe(200)
  expect(res.headers()['content-type']).toBe('application/pdf')
  const disposition = res.headers()['content-disposition'] ?? ''
  const number = /go4solar-invoice-(G4S-(?:TEST-)?INV-\d{4}-\d{4,})\.pdf/.exec(disposition)?.[1]
  expect(number, disposition).toBeTruthy()
  const body = await res.body()
  expect(body.subarray(0, 4).toString()).toBe('%PDF')
  return { number: number!, size: body.length }
}

/** The verify code of an invoice, read with the service role (test helper only). */
export async function verifyCodeFor(number: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const res = await fetch(
    `${url}/rest/v1/invoices?select=public_code,total&number=eq.${encodeURIComponent(number)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  const [row] = (await res.json()) as { public_code: string; total: number }[]
  return row!.public_code
}

/** /verify/<code>: genuine with the first name and total; a made-up code: not found. */
export async function checkVerifyPage(page: Page, code: string, firstName: string) {
  await page.goto(`/verify/${code}`)
  await expect(page.getByTestId('verify-genuine')).toContainText('genuine')
  await expect(page.getByTestId('verify-genuine')).toContainText(firstName)
  await expect(page.getByTestId('verify-total')).toContainText('₦')
  await page.goto('/verify/zzzzzzzzzzzz')
  await expect(page.getByTestId('verify-not-found')).toBeVisible()
}
