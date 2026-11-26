'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { voidExportBatch } from '@/app/admin/(shell)/exports/actions'

/**
 * "Void batch" (super admin): for a batch exported by mistake. Asks for the reason, then
 * confirms. The funder never sees it, its people can be exported again, its number is freed.
 */
export function VoidBatchButton({ batchId, number }: { batchId: string; number: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  if (!open)
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-1"
        data-testid="void-batch"
        onClick={() => setOpen(true)}
      >
        Void batch
      </Button>
    )
  return (
    <span className="mt-1 flex flex-col gap-1" data-testid="void-batch-form">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        aria-label={`Reason for voiding ${number}`}
      />
      <span className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending || reason.trim().length < 3}
          data-testid="confirm-void"
          onClick={() =>
            start(async () => {
              const r = await voidExportBatch({ batchId, reason })
              setMsg(r.ok ? `Voided: now ${r.voidNumber}.` : r.error)
              if (r.ok) router.refresh()
            })
          }
        >
          {pending ? 'Voiding…' : `Void ${number}`}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </span>
      {msg && (
        <span className="text-xs" role="status">
          {msg}
        </span>
      )}
    </span>
  )
}
