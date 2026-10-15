'use client'

import { useState, useTransition } from 'react'

import { resendEmailVerification } from '@/app/(consumer)/app/actions'

export function EmailBanner({ email }: { email: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
      data-testid="email-banner"
      role="status"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Please confirm your email: we sent a link to <strong>{email}</strong>. You need it before
          you sign your agreement.
        </span>
        <button
          type="button"
          className="font-semibold underline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await resendEmailVerification()
              setMsg(r.ok ? 'Sent. Check your inbox.' : (r.error ?? 'Could not send.'))
            })
          }
        >
          Resend the link
        </button>
        {msg && <span>{msg}</span>}
      </div>
    </div>
  )
}
