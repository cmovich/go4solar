'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { decideChangeRequest } from '@/app/admin/(shell)/change-requests/actions'

export function ChangeRequestRow(p: {
  id: string
  customer: string
  field: string
  currentValue: string | null
  newValue: string
  reason: string | null
  when: string
}) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const decide = (decision: 'approve' | 'reject') =>
    start(async () => {
      setError(null)
      const r = await decideChangeRequest({ id: p.id, decision, note: note || undefined })
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  return (
    <li className="rounded-xl border bg-white p-4 text-sm" data-testid="change-request">
      <p className="text-brand-dark font-semibold">
        {p.customer} · {p.field}
      </p>
      <p className="text-muted-foreground text-xs">{p.when}</p>
      <dl className="mt-2 grid gap-1 sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted-foreground">Now</dt>
        <dd>{p.currentValue ?? '—'}</dd>
        <dt className="text-muted-foreground">Change to</dt>
        <dd className="font-semibold">{p.newValue}</dd>
        {p.reason && (
          <>
            <dt className="text-muted-foreground">Reason</dt>
            <dd>{p.reason}</dd>
          </>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note to the customer (optional)"
          maxLength={300}
          className="h-10 max-w-sm"
          aria-label="Note to the customer"
        />
        <Button type="button" disabled={pending} onClick={() => decide('approve')}>
          Approve
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => decide('reject')}>
          Reject
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </li>
  )
}
