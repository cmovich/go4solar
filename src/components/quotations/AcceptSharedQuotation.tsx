'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { THANK_YOU_TEXT } from '@/lib/waitlist/schema'

import { acceptSharedQuotation } from '@/app/(public)/q/actions'

const FIELDS = [
  ['firstName', 'First name', 'given-name', 'text'],
  ['surname', 'Surname', 'family-name', 'text'],
  ['phone', 'Phone number', 'tel', 'tel'],
  ['email', 'Email address', 'email', 'email'],
  ['lga', 'Local government area', 'address-level2', 'text'],
] as const
type Key = (typeof FIELDS)[number][0]

/**
 * "Accept and apply": the customer gives their own details (the name and phone staff typed are
 * only a starting point), then the normal sign-up continues from this quotation.
 */
export function AcceptSharedQuotation({
  code,
  name,
  phone,
}: {
  code: string
  name: string | null
  phone: string | null
}) {
  const router = useRouter()
  const [first, ...rest] = (name ?? '').trim().split(/\s+/)
  const [open, setOpen] = useState(false)
  const [c, setC] = useState<Record<Key, string>>({
    firstName: first ?? '',
    surname: rest.join(' '),
    phone: phone ? `0${phone.slice(4)}` : '',
    email: '',
    lga: '',
  })
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <section
        className="border-brand-green rounded-2xl border-2 p-6 text-center"
        data-testid="accepted"
      >
        <h2 className="text-brand-dark text-xl font-bold">Thank you!</h2>
        <p className="mt-2">{THANK_YOU_TEXT}</p>
      </section>
    )
  }
  if (!open) {
    return (
      <Button
        type="button"
        className="h-12 w-full text-base sm:w-auto sm:px-10"
        data-testid="accept-and-apply"
        onClick={() => setOpen(true)}
      >
        Accept and apply
      </Button>
    )
  }
  return (
    <section className="space-y-3" data-testid="accept-details">
      <h2 className="text-brand-dark text-lg font-bold">Your details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label, auto, type]) => (
          <div key={k}>
            <Label htmlFor={`a-${k}`}>{label}</Label>
            <Input
              id={`a-${k}`}
              type={type}
              autoComplete={auto}
              value={c[k]}
              onChange={(e) => setC({ ...c, [k]: e.target.value })}
              className="mt-1 h-11"
            />
          </div>
        ))}
      </div>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <Checkbox
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
        />
        I agree that Go4Solar may contact me about this system by phone, WhatsApp and email.
      </label>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        className="h-12 w-full text-base sm:w-auto sm:px-10"
        disabled={pending || !consent}
        data-testid="accept-submit"
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await acceptSharedQuotation({ code, contact: { ...c, consent: true } })
            if (!r.ok) return setError(r.error)
            if (r.next) router.push(r.next)
            else setDone(true)
          })
        }
      >
        {pending ? 'Saving…' : 'Continue'}
      </Button>
    </section>
  )
}
