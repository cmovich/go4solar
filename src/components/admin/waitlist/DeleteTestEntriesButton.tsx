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

import { deleteAllTestEntries } from '@/app/admin/(shell)/waitlist/actions'

/** Deletes every entry marked as test data (is_test) — never a real person. */
export function DeleteTestEntriesButton({ count }: { count: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function confirm() {
    setError(null)
    start(async () => {
      const r = await deleteAllTestEntries({ expected: count })
      if (r.ok) {
        setOpen(false)
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={count === 0}>
          Delete all test entries ({count})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {count} test entries?</DialogTitle>
          <DialogDescription>
            Only entries marked as test data are deleted (test emails and 0800000 phones, consumers
            and installers). Real sign-ups are not touched. The audit log records every id.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? 'Deleting…' : `Delete ${count} test entries`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
