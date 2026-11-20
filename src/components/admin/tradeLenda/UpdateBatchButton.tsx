'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'

import { sendUpdatedBatch } from '@/app/admin/(shell)/waitlist/profiles/actions'

/** Send a new version of a batch (same number and lending type) with today's profiles. */
export function UpdateBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="mt-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await sendUpdatedBatch(batchId)
            if (!r.ok) setError(r.error)
            else router.refresh()
          })
        }
      >
        {pending ? 'Sending…' : 'Send updated version'}
      </Button>
      {error && (
        <p className="text-destructive mt-1 text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
