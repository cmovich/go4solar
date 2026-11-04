'use client'

import { useRouter } from 'next/navigation'

import { QuotationStep } from '@/components/invoices/QuotationStep'

/** Prelaunch builder: "Your quotation" after Submit; Accept → the thank-you screen. */
export function BuildQuotation({ leadId }: { leadId: string }) {
  const router = useRouter()
  return (
    <QuotationStep
      leadId={leadId}
      pdfHref={() => `/api/quotations/build/${leadId}`}
      onAccepted={() => router.push('/build?done=1')}
    />
  )
}
