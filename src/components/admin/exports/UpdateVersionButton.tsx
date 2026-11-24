'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'

import { sendUpdatedVersion } from '@/app/admin/(shell)/exports/actions'

/** "Send updated version" (same batch number, next version, today's details: Basic → Full). */
export function UpdateVersionButton({ batchId }: { batchId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        data-testid="send-updated-version"
        onClick={() =>
          start(async () => {
            const r = await sendUpdatedVersion({ batchId })
            setMsg(r.ok ? `Sent ${r.number} v${r.version}.` : r.error)
            if (r.ok) router.refresh()
          })
        }
      >
        {pending ? 'Sending…' : 'Send updated version'}
      </Button>
      {msg && (
        <span className="text-xs" role="status">
          {msg}
        </span>
      )}
    </span>
  )
}
