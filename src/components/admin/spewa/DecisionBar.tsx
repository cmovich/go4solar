'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { decideSpewaFiles } from '@/app/admin/(shell)/spewa/actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

/**
 * Approve or decline the given files (one, or every ticked one). Approve = final approval with
 * SPEWA as the funder; decline = back to Go4Solar's general queue (a reason is required).
 */
export function DecisionBar({
  ids,
  names = {},
  onDone,
}: {
  ids: string[]
  /** For messages about single files in a bulk decision. */
  names?: Record<string, string>
  onDone?: () => void
}) {
  const router = useRouter()
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [messages, setMessages] = useState<string[]>([])
  const [pending, start] = useTransition()
  const n = ids.length
  const suffix = n > 1 ? ` (${n})` : ''

  const run = (decision: 'approve' | 'decline') =>
    start(async () => {
      setMessages([])
      const res = await decideSpewaFiles({
        ids,
        decision,
        ...(decision === 'decline' ? { reason } : {}),
      })
      if (!res.ok) {
        setMessages([res.error])
        return
      }
      const done = res.results.filter((r) => r.ok).length
      const failed = res.results.flatMap((r) =>
        r.ok ? [] : [`${names[r.id] ?? 'File'}: ${r.error}`],
      )
      setMessages([
        `${done} ${decision === 'approve' ? 'approved' : 'declined'}${failed.length ? `, ${failed.length} not` : ''}.`,
        ...failed,
      ])
      setDeclining(false)
      setReason('')
      onDone?.()
      router.refresh()
    })

  return (
    <div className="space-y-2" data-testid="spewa-decision">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => run('approve')}
          disabled={!n || pending}
          data-testid="spewa-approve"
        >
          {pending ? 'Working…' : `Approve${suffix}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setDeclining((v) => !v)}
          disabled={!n || pending}
          data-testid="spewa-decline-open"
        >
          {`Decline${suffix}`}
        </Button>
      </div>
      {declining && (
        <div className="max-w-lg space-y-2 rounded-lg border bg-white p-3">
          <Label htmlFor="spewa-reason">
            Reason (Go4Solar staff see it; the customer is not told)
          </Label>
          <textarea
            id="spewa-reason"
            className="border-input min-h-20 w-full rounded-md border px-3 py-2 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
          />
          <p className="text-muted-foreground text-xs">
            Declined files go back to Go4Solar&rsquo;s general queue.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={() => run('decline')}
            disabled={pending || reason.trim().length < 3}
            data-testid="spewa-decline"
          >
            {`Decline${suffix}`}
          </Button>
        </div>
      )}
      {messages.length > 0 && (
        <div role="status" className="text-sm" data-testid="spewa-result">
          {messages.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}
    </div>
  )
}
