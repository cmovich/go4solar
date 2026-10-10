'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'

import { resendEmailVerification } from '@/app/(consumer)/app/actions'

/** Signing is blocked until the email is confirmed. */
export function VerifyEmailGate({ email }: { email: string | null }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <section
      className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5"
      data-testid="verify-email-gate"
    >
      <h2 className="text-lg font-bold text-amber-900">Verify your email to sign</h2>
      <p className="mt-1 text-sm text-amber-900">
        We sent a link to {email ? <strong>{email}</strong> : 'your email'}. Open it, then come back
        to this page.
      </p>
      <Button
        type="button"
        className="mt-3"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resendEmailVerification()
            setMsg(r.ok ? 'Sent. Check your inbox (and spam).' : (r.error ?? 'Could not send.'))
          })
        }
      >
        Resend the link
      </Button>
      {msg && (
        <p className="mt-2 text-sm" role="status">
          {msg}
        </p>
      )}
    </section>
  )
}
