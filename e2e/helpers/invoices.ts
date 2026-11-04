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
 * Opens a "Download PDF" link (following any redirect to the signed link) and checks it is a PDF
 * shown in the browser (inline) with a .pdf name. Returns the number printed on it: the invoice
 * number, or the quote reference for a quotation.
 */
export async function openPdf(
  request: APIRequestContext,
  href: string,
  kind: 'quotation' | 'invoice',
) {
  const res = await request.get(href)
  expect(res.status(), await res.text().catch(() => '')).toBe(200)
  expect(res.headers()['content-type']).toBe('application/pdf')
  const disposition = res.headers()['content-disposition'] ?? ''
  expect(disposition).toMatch(/^inline; filename="go4solar-/)
  const re =
    kind === 'invoice'
      ? /go4solar-invoice-(G4S-(?:TEST-)?INV-\d{4}-\d{4,})\.pdf/
      : /go4solar-quotation-(G4S-[0-9A-F]{8})\.pdf/
  const number = re.exec(disposition)?.[1]
  expect(number, disposition).toBeTruthy()
  const body = await res.body()
  expect(body.subarray(0, 4).toString()).toBe('%PDF')
  return { number: number!, size: body.length }
}

/** Kept for the long journey: an invoice link. */
export const downloadInvoice = (request: APIRequestContext, href: string) =>
  openPdf(request, href, 'invoice')

/** The invoice issued for a quote (service role, test helper only). */
export async function invoiceForQuote(
  quoteId: string,
): Promise<{ number: string; code: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const res = await fetch(
    `${url}/rest/v1/invoices?select=number,public_code&quote_id=eq.${quoteId}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  const rows = (await res.json()) as { number: string; public_code: string }[]
  return rows[0] ? { number: rows[0].number, code: rows[0].public_code } : null
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

/** True once migration 0029 (quotation accepted) is applied. */
export async function quotationAcceptMigrated(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/quotes?select=accepted_at&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok
}

/**
 * Live: after "Choose …" (or Apply in the builder) comes "Your quotation"; Accept goes on to the
 * account step. Returns the quote id.
 */
export async function acceptQuotation(page: Page): Promise<string> {
  await page.waitForURL(/\/quotation\/[0-9a-f-]{36}$/, { timeout: 45_000 })
  const quoteId = new URL(page.url()).pathname.split('/').pop()!
  await expect(page.getByRole('heading', { name: 'Your quotation' })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByTestId('accept-quotation').click()
  await page.waitForURL(/\/account\?quote=/, { timeout: 45_000 })
  return quoteId
}
