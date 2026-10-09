'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

type State =
  | { step: 'loading' }
  | { step: 'enrol'; factorId: string; qrCode: string; secret: string }
  | { step: 'verify'; factorId: string }
  | { step: 'error'; message: string }

/**
 * Two situations:
 *  - no verified authenticator yet → show a QR code to scan, then ask for the first code (enrol)
 *  - authenticator already set up, but not verified in this session → ask for a code (verify)
 */
export function MfaSetup() {
  const router = useRouter()
  // Created lazily, in effects and handlers only: nothing touches Supabase during server
  // rendering or the build's trial render.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => (supabaseRef.current ??= createClient())
  const [state, setState] = useState<State>({ step: 'loading' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false

    async function prepare() {
      const { data: factors, error: listError } = await getSupabase().auth.mfa.listFactors()
      if (listError) return setState({ step: 'error', message: listError.message })

      // `factors.totp` holds verified authenticators only; `factors.all` includes unverified ones.
      const verified = factors.totp[0]
      if (verified) return setState({ step: 'verify', factorId: verified.id })

      // Clear half-finished enrolments so we always show one fresh QR code.
      const stale = factors.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')
      for (const factor of stale) {
        await getSupabase().auth.mfa.unenroll({ factorId: factor.id })
      }

      const { data, error: enrolError } = await getSupabase().auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Go4Solar authenticator',
      })
      if (enrolError) return setState({ step: 'error', message: enrolError.message })
      if (!cancelled) {
        setState({
          step: 'enrol',
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
        })
      }
    }

    void prepare()
    return () => {
      cancelled = true
    }
  }, [])

  function submit(factorId: string) {
    setError(null)
    startTransition(async () => {
      const { error: verifyError } = await getSupabase().auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      })
      if (verifyError) {
        setError('That code did not work. Check the time on your phone and try again.')
        return
      }
      router.replace('/admin')
      router.refresh()
    })
  }

  if (state.step === 'loading') return <p className="text-muted-foreground text-sm">Preparing…</p>

  if (state.step === 'error') {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit(state.factorId)
      }}
      className="space-y-4"
    >
      {state.step === 'enrol' && (
        <div className="space-y-3">
          <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
            <li>Open Google Authenticator (or any authenticator app) on your phone.</li>
            <li>Tap “+” and scan this code.</li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          <div className="flex justify-center rounded-md border bg-white p-3">
            <Image
              src={state.qrCode}
              alt="QR code for your authenticator app"
              width={192}
              height={192}
              unoptimized
            />
          </div>
          <p className="text-muted-foreground text-xs break-all">
            Can’t scan? Enter this key by hand: <span className="font-mono">{state.secret}</span>
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={pending || code.trim().length !== 6}>
        {pending ? 'Checking…' : state.step === 'enrol' ? 'Finish setup' : 'Verify'}
      </Button>
    </form>
  )
}
