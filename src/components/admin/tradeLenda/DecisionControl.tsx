'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { decideFunderItem } from '@/app/admin/(shell)/funder/actions'

const LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  needs_info: 'Needs info',
}

/** Trade Lenda's decision on one customer (read-only for everyone else). */
export function DecisionControl(p: {
  itemId: string
  batchId: string
  decision: string
  note: string | null
  canDecide: boolean
}) {
  const router = useRouter()
  const [note, setNote] = useState(p.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const decide = (decision: 'approved' | 'declined' | 'needs_info') =>
    start(async () => {
      setError(null)
      const r = await decideFunderItem({
        itemId: p.itemId,
        batchId: p.batchId,
        decision,
        note: note || null,
      })
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  return (
    <div className="space-y-1" data-testid={`decision-${p.itemId}`}>
      <p className="font-semibold">{LABELS[p.decision] ?? p.decision}</p>
      {p.note && !p.canDecide && <p className="text-muted-foreground text-xs">{p.note}</p>}
      {p.canDecide && (
        <>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (needed to decline or ask for info)"
            aria-label="Decision note"
            className="h-9"
            maxLength={1000}
          />
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" disabled={pending} onClick={() => decide('approved')}>
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => decide('needs_info')}
            >
              Needs info
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => decide('declined')}
            >
              Decline
            </Button>
          </div>
          {error && (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}
