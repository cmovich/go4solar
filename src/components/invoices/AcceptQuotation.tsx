'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { acceptQuotation } from '@/app/(public)/quotation/actions'

/** "Accept and continue": the quotation becomes the invoice; then the account step. */
export function AcceptQuotation({ quoteId }: { quoteId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        className="h-12 w-full text-base sm:w-auto sm:px-10"
        disabled={pending}
        data-testid="accept-quotation"
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await acceptQuotation({ quoteId })
            if (r.ok) router.push(r.next)
            else setError(r.error)
          })
        }
      >
        {pending ? 'Accepting…' : 'Accept and continue'}
      </Button>
    </div>
  )
}
