'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DELETE_REASONS, DELETE_REASON_LABELS, type DeleteReason } from '@/lib/waitlist/duplicates'

import { deleteWaitlistEntry } from '@/app/admin/(shell)/waitlist/actions'

/** Bin icon on a waiting-list row: confirm with a reason (Duplicate / Test user / Other). */
export function DeleteEntryButton({
  table,
  id,
  label,
}: {
  table: 'consumers' | 'installers'
  id: string
  /** Name or phone, shown in the dialog. */
  label: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<DeleteReason | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const wrapper = useRef<HTMLSpanElement>(null)

  function confirm() {
    setError(null)
    start(async () => {
      const r = await deleteWaitlistEntry({ table, id, reason, note: note || undefined })
      if (r.ok) {
        setOpen(false)
        // Hide the row at once; the refresh (counts, badges) can take a while on slow links.
        const row = wrapper.current?.closest('tr')
        if (row) row.hidden = true
        router.refresh()
      } else setError(r.error)
    })
  }

  // Clicks inside the dialog (a portal) still bubble to the row in React: stop them here.
  return (
    <span ref={wrapper} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          setReason(null)
          setNote('')
          setError(null)
          setOpen(true)
        }}
        className="text-muted-foreground hover:text-destructive inline-flex size-9 items-center justify-center rounded-md"
        aria-label={`Delete ${label}`}
        title="Delete"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete this entry?</DialogTitle>
            <DialogDescription>
              {label} will be removed from the waiting list. The audit log keeps a full copy, so it
              can be restored.
            </DialogDescription>
          </DialogHeader>
          <fieldset>
            <legend className="text-sm font-medium">Reason</legend>
            <div className="mt-2 space-y-2">
              {DELETE_REASONS.map((r) => (
                <label key={r} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`reason-${id}`}
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-brand-green size-4"
                  />
                  {DELETE_REASON_LABELS[r]}
                </label>
              ))}
            </div>
          </fieldset>
          {reason === 'other' && (
            <div>
              <Label htmlFor={`note-${id}`}>Why?</Label>
              <Input
                id={`note-${id}`}
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 h-11"
              />
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirm}
              disabled={pending || !reason || (reason === 'other' && !note.trim())}
            >
              {pending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  )
}
