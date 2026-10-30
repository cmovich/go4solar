'use client'

import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CHANGE_FIELDS, CHANGE_FIELD_LABELS, type ChangeField } from '@/lib/account/account'

import { requestDetailChange } from '@/app/(consumer)/app/actions'

/** "Request a change": verified details change only after staff approve. */
export function RequestChange() {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<ChangeField>('phone')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(true)}>
        Request a change
      </Button>
    )
  }
  return (
    <div className="bg-brand-mist space-y-3 rounded-xl p-4" data-testid="request-change">
      <p className="text-sm">
        For your safety we check every change to your verified details before it is made. We will
        tell you when it is done.
      </p>
      <div>
        <Label htmlFor="change-field">What do you want to change?</Label>
        <select
          id="change-field"
          value={field}
          onChange={(e) => setField(e.target.value as ChangeField)}
          className="border-input mt-1 block h-11 w-full rounded-md border bg-white px-3 text-base"
        >
          {CHANGE_FIELDS.map((f) => (
            <option key={f} value={f}>
              {CHANGE_FIELD_LABELS[f]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="change-value">New {CHANGE_FIELD_LABELS[field].toLowerCase()}</Label>
        <Input
          id="change-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode={field === 'phone' ? 'tel' : field === 'email' ? 'email' : 'text'}
          className="mt-1 h-11 bg-white text-base"
        />
      </div>
      <div>
        <Label htmlFor="change-reason">Why? (optional)</Label>
        <Input
          id="change-reason"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 h-11 bg-white text-base"
        />
      </div>
      {msg && (
        <Alert variant={msg.ok ? 'default' : 'destructive'} role="status">
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-11"
          disabled={pending || value.trim().length < 2}
          onClick={() =>
            start(async () => {
              const r = await requestDetailChange({
                field,
                newValue: value,
                reason: reason || undefined,
              })
              if (r.ok) {
                setMsg({ ok: true, text: 'Request sent. We will tell you when it is done.' })
                setValue('')
                setReason('')
              } else setMsg({ ok: false, text: r.error })
            })
          }
        >
          {pending ? 'Sending…' : 'Send request'}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  )
}
