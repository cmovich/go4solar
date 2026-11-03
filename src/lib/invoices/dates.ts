/** "10 Nov 2026" in Lagos time (invoices, the verify page). */
export function invoiceDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  })
}
