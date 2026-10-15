'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { createAccount, sendPhoneCode, verifyPhoneCode } from '@/app/(public)/account/actions'

const field = 'mt-1 h-12 text-base'

export function AccountFlow({
  quoteId,
  defaultEmail,
  phoneDisplay,
  signedIn,
}: {
  quoteId: string
  defaultEmail: string
  phoneDisplay: string
  signedIn: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState<'account' | 'code'>(signedIn ? 'code' : 'account')
  const [codeSent, setCodeSent] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<{ text: string; exists?: boolean } | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await createAccount({ quoteId, email, password })
      if (r.ok) {
        setStep('code')
        setCodeSent(true)
      } else setError({ text: r.error, exists: r.exists })
    })
  }

  function resend() {
    setError(null)
    setInfo(null)
    start(async () => {
      const r = await sendPhoneCode({ quoteId })
      if (r.ok) {
        setCodeSent(true)
        setInfo('A new code is on its way.')
      } else setError({ text: r.error })
    })
  }

  function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await verifyPhoneCode({ quoteId, code })
      if (r.ok) router.push('/app/apply')
      else setError({ text: r.error })
    })
  }

  const errorBox = error && (
    <Alert variant="destructive">
      <AlertDescription>
        {error.text}{' '}
        {error.exists && (
          <Link
            className="underline"
            href={`/login?next=${encodeURIComponent(`/account?quote=${quoteId}`)}`}
          >
            Sign in
          </Link>
        )}
      </AlertDescription>
    </Alert>
  )

  if (step === 'account') {
    return (
      <form onSubmit={create} className="space-y-5" noValidate>
        <div>
          <Label htmlFor="acc-email">Email</Label>
          <Input
            id="acc-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="acc-password">Create a password</Label>
          <Input
            id="acc-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          <p className="text-muted-foreground mt-1 text-xs">At least 8 characters.</p>
        </div>
        <p className="text-sm" data-testid="phone-on-file">
          We&apos;ll text a 6-digit code to <strong>{phoneDisplay}</strong> to confirm it&apos;s
          you.
        </p>
        {errorBox}
        <Button type="submit" className="h-14 w-full text-lg font-semibold" disabled={pending}>
          {pending ? 'Creating your account…' : 'Create account and send code'}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={verify} className="space-y-5" noValidate>
      <p className="text-base">
        {codeSent ? (
          <>
            We sent a 6-digit code to <strong>{phoneDisplay}</strong>. It expires in 10 minutes.
          </>
        ) : (
          <>
            Tap below and we&apos;ll text a 6-digit code to <strong>{phoneDisplay}</strong>.
          </>
        )}
      </p>
      {codeSent && (
        <div>
          <Label htmlFor="otp">6-digit code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${field} tracking-[0.4em]`}
          />
        </div>
      )}
      {errorBox}
      {info && (
        <p className="text-brand-green text-sm" role="status">
          {info}
        </p>
      )}
      {codeSent ? (
        <>
          <Button
            type="submit"
            className="h-14 w-full text-lg font-semibold"
            disabled={pending || code.trim().length < 6}
          >
            {pending ? 'Checking…' : 'Verify my phone'}
          </Button>
          <button
            type="button"
            onClick={resend}
            disabled={pending}
            className="text-brand-blue text-sm underline"
          >
            Send a new code
          </button>
        </>
      ) : (
        <Button
          type="button"
          className="h-14 w-full text-lg font-semibold"
          onClick={resend}
          disabled={pending}
        >
          Send me the code
        </Button>
      )}
    </form>
  )
}
