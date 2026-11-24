'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'

import { addToExportQueue } from '@/app/admin/(shell)/exports/actions'

/** "Add to export queue" for the ticked rows; asks before adding to an already open queue. */
export function AddToQueueBar({
  selected,
  openQueue,
  onDone,
  isTest,
}: {
  selected: string[]
  openQueue: string | null
  onDone: () => void
  isTest: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [asking, setAsking] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const add = () =>
    start(async () => {
      setAsking(false)
      const r = await addToExportQueue({ ids: selected })
      if (!r.ok) setMsg({ ok: false, text: r.error })
      else {
        setMsg({ ok: true, text: `Added ${r.added} to ${r.number}.` })
        onDone()
        router.refresh()
      }
    })
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm" data-testid="queue-bar">
      <Button
        type="button"
        disabled={pending || selected.length === 0}
        onClick={() => (openQueue ? setAsking(true) : add())}
        data-testid="add-to-queue"
      >
        Add {selected.length || ''} to export queue
      </Button>
      {asking && (
        <span
          className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900"
          role="alert"
        >
          Add to open queue {openQueue}?
          <Button type="button" size="sm" onClick={add} data-testid="confirm-add">
            Yes, add
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </span>
      )}
      {msg && (
        <span
          className={msg.ok ? 'text-brand-green' : 'text-destructive'}
          role="status"
          data-testid="queue-bar-message"
        >
          {msg.text}{' '}
          {msg.ok && (
            <Link
              href={`/admin/exports/queue${isTest ? '?test=1' : ''}`}
              className="text-brand-blue underline"
            >
              Open the queue
            </Link>
          )}
        </span>
      )}
    </div>
  )
}
