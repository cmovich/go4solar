import { FileDown } from 'lucide-react'

/** "Download PDF" for an invoice (a plain link: the PDF downloads, the page stays). */
export function InvoiceLink({
  href,
  testId,
  label = 'Download PDF',
}: {
  href: string
  testId: string
  label?: string
}) {
  return (
    <a
      href={href}
      className="text-brand-blue inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold underline"
      data-testid={testId}
      download
    >
      <FileDown className="size-4" aria-hidden />
      {label}
    </a>
  )
}

/** The plans-page invoice for one plan at a deposit and length. */
export function planInvoiceHref(leadId: string, plan: string, deposit: number, tenure: number) {
  const q = new URLSearchParams({
    lead: leadId,
    plan,
    deposit: String(deposit),
    tenure: String(tenure),
  })
  return `/api/invoices/plan?${q}`
}
