'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { clearWaitlist } from '@/app/admin/(shell)/waitlist/actions'

/** Super admin only. Disabled until an export was downloaded in the last 24 h; then type CLEAR. */
export function ClearWaitlistButton({
  exportRecent,
  total,
}: {
  exportRecent: boolean
  total: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function confirm() {
    setError(null)
    start(async () => {
      const r = await clearWaitlist({ confirmation: word })
      if (r.ok) {
        setOpen(false)
        setWord('')
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="destructive"
          disabled={!exportRecent || total === 0}
          title={exportRecent ? undefined : 'Download a PDF or CSV export first (within 24 hours)'}
        >
          Clear waiting list
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Clear the whole waiting list?</DialogTitle>
          <DialogDescription>
            This deletes all {total} consumer and installer records and cannot be undone. Make sure
            the export you just downloaded is saved somewhere safe.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="clear-word">Type CLEAR to confirm</Label>
          <Input
            id="clear-word"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            autoComplete="off"
            className="mt-1 h-11"
          />
        </div>
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
            disabled={pending || word !== 'CLEAR'}
          >
            {pending ? 'Clearing…' : 'Clear everything'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
