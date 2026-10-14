'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RelationshipField } from '@/components/apply/RelationshipField'

import { nominateGuarantor, resendGuarantorInvite } from '@/app/(consumer)/app/apply/sign/actions'

type Status = 'invited' | 'in_progress' | 'signed' | 'declined' | 'expired'

/** Where the guarantor is, with resend (new link, old one stops) and nominate-another after a decline. */
export function GuarantorPanel({
  guarantee,
}: {
  guarantee: {
    name: string
    status: Status
    expires_at: string
    decline_reason: string | null
  } | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [rel, setRel] = useState({ relationship: '', relationshipOther: '' })

  const expired =
    guarantee &&
    guarantee.status !== 'signed' &&
    guarantee.status !== 'declined' &&
    new Date(guarantee.expires_at) < new Date()
  const status: Status | null = guarantee ? (expired ? 'expired' : guarantee.status) : null
  const needsNew = status === 'declined'

  const label: Record<Status, string> = {
    invited: 'We sent them a link. Waiting for them to open it.',
    in_progress: 'They have opened the link and are filling it in.',
    signed: 'They have signed the guarantee. Thank you.',
    declined: 'They said no.',
    expired: 'Their link expired. Send them a new one.',
  }

  function resend() {
    setError(null)
    start(async () => {
      const r = await resendGuarantorInvite()
      if (r.ok) {
        setMsg('New link sent. The old link no longer works.')
        router.refresh()
      } else setError(r.error)
    })
  }

  function nominate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await nominateGuarantor({ ...form, ...rel })
      if (r.ok) {
        setMsg('Link sent to your new guarantor.')
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <section className="rounded-2xl border p-5" data-testid="guarantor-panel">
      <h2 className="text-brand-dark text-lg font-bold">Your guarantor</h2>
      {guarantee && status ? (
        <>
          <p className="mt-1 text-sm">
            <strong>{guarantee.name}</strong>:{' '}
            <span data-testid="guarantor-status">{label[status]}</span>
          </p>
          {status === 'declined' && guarantee.decline_reason && (
            <p className="text-muted-foreground mt-1 text-sm">
              Their reason: “{guarantee.decline_reason}”
            </p>
          )}
          {(status === 'invited' || status === 'in_progress' || status === 'expired') && (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={pending}
              onClick={resend}
            >
              Send them a new link
            </Button>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm">
          We will send your guarantor a link when your application is complete.
        </p>
      )}

      {needsNew && (
        <form onSubmit={nominate} className="mt-4 space-y-3" data-testid="nominate-form">
          <p className="text-sm font-semibold">Please ask someone else to be your guarantor.</p>
          {(
            [
              ['name', 'Full name', 'name'],
              ['phone', 'Phone number', 'tel'],
              ['email', 'Email', 'email'],
            ] as const
          ).map(([k, l, ac]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`g-${k}`}>{l}</Label>
              <Input
                id={`g-${k}`}
                autoComplete={ac}
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                required
              />
            </div>
          ))}
          <RelationshipField
            id="g-relationship"
            label="How you know them"
            value={rel}
            onChange={setRel}
          />
          <Button
            type="submit"
            className="bg-brand-green hover:bg-brand-dark w-full"
            disabled={pending}
          >
            Send them the link
          </Button>
        </form>
      )}

      {msg && (
        <p className="text-brand-green mt-2 text-sm font-semibold" role="status">
          {msg}
        </p>
      )}
      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
