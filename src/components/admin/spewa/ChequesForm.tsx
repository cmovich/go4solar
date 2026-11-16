'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { saveCheques } from '@/app/admin/(shell)/spewa/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** "Post-dated cheques received: yes/no, number, date received" (entered by our staff). */
export function ChequesForm({
  applicationId,
  initial,
}: {
  applicationId: string
  initial: { received: boolean | null; count: number | null; receivedOn: string | null }
}) {
  const router = useRouter()
  const [received, setReceived] = useState<'yes' | 'no' | ''>(
    initial.received === null ? '' : initial.received ? 'yes' : 'no',
  )
  const [count, setCount] = useState(initial.count?.toString() ?? '')
  const [receivedOn, setReceivedOn] = useState(initial.receivedOn ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      const res = await saveCheques(applicationId, { received, count, receivedOn })
      setMessage(res.ok ? 'Saved.' : res.error)
      if (res.ok) router.refresh()
    })

  return (
    <fieldset
      className="space-y-3 rounded-xl border bg-white p-4 text-sm"
      data-testid="cheques-form"
    >
      <legend className="text-brand-dark px-1 font-bold">Post-dated cheques received</legend>
      <div className="flex gap-4">
        {(['yes', 'no'] as const).map((v) => (
          <label key={v} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={`cheques-${applicationId}`}
              value={v}
              checked={received === v}
              onChange={() => setReceived(v)}
            />
            {v === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
      {received === 'yes' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cheques-count">Number of cheques</Label>
            <Input
              id="cheques-count"
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cheques-date">Date received</Label>
            <Input
              id="cheques-date"
              type="date"
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </div>
        </div>
      )}
      <Button
        type="button"
        onClick={save}
        disabled={!received || pending}
        data-testid="cheques-save"
      >
        {pending ? 'Saving…' : 'Save'}
      </Button>
      {message && (
        <p role="status" data-testid="cheques-message">
          {message}
        </p>
      )}
    </fieldset>
  )
}
