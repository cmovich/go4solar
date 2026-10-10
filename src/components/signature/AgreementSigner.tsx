'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { AgreementText } from './AgreementText'
import { SignatureCanvas } from './SignatureCanvas'

type Result = { ok: true } | { ok: false; error: string; needsEmail?: boolean }

export type SignPayload = {
  typedName: string
  signerTitle?: string
  ticks: Record<string, boolean>
  scrolledToEnd: boolean
  signature: string
  code: string
}

const END_SLACK_PX = 24

/** True once the reader has reached the bottom of the scroll box. */
export function reachedEnd(el: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}): boolean {
  return el.scrollHeight > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - END_SLACK_PX
}

/**
 * Read → tick → type name → draw signature → phone code → sign. Signing stays disabled until
 * the agreement has been scrolled to the end and every box is ticked.
 */
export function AgreementSigner({
  text,
  ticks,
  defaultName,
  titleLabel,
  defaultTitle,
  phoneHint,
  sendCode,
  sign,
  onSigned,
}: {
  text: string
  ticks: { id: string; label: string }[]
  defaultName: string
  /** Shown for business applicants: their title as director / authorised signatory. */
  titleLabel?: string
  defaultTitle?: string | null
  phoneHint: string
  sendCode: () => Promise<Result>
  sign: (payload: SignPayload) => Promise<Result>
  onSigned: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [name, setName] = useState(defaultName)
  const [title, setTitle] = useState(defaultTitle ?? '')
  const [signature, setSignature] = useState<string | null>(null)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // A short agreement that fits without scrolling counts as read.
  useEffect(() => {
    const el = boxRef.current
    if (el && el.scrollHeight > 0 && el.scrollHeight <= el.clientHeight) setScrolled(true)
  }, [])

  const allTicked = ticks.every((t) => ticked[t.id])
  const titleOk = !titleLabel || title.trim().length >= 2
  const ready = scrolled && allTicked && name.trim().length >= 3 && Boolean(signature) && titleOk
  const missing = !scrolled
    ? 'Read the agreement to the end to sign.'
    : !allTicked
      ? 'Tick every box above.'
      : name.trim().length < 3
        ? 'Type your full name.'
        : !titleOk
          ? 'Enter your title.'
          : !signature
            ? 'Draw your signature in the box.'
            : null

  function onSend() {
    setError(null)
    start(async () => {
      const r = await sendCode()
      if (r.ok) setCodeSent(true)
      else setError(r.error)
    })
  }

  function onSign() {
    if (!ready || !signature) return
    setError(null)
    start(async () => {
      const r = await sign({
        typedName: name.trim(),
        signerTitle: titleLabel ? title.trim() : undefined,
        ticks: ticked,
        scrolledToEnd: scrolled,
        signature,
        code: code.trim(),
      })
      if (r.ok) onSigned()
      else setError(r.error)
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <div
          ref={boxRef}
          data-testid="agreement-scroll"
          tabIndex={0}
          aria-label="Full agreement. Scroll to the end to continue."
          onScroll={(e) => {
            if (!scrolled && reachedEnd(e.currentTarget)) setScrolled(true)
          }}
          className="h-96 overflow-y-auto rounded-xl border bg-white p-4 text-sm leading-relaxed"
        >
          <AgreementText text={text} />
          <p className="text-brand-green mt-6 text-center text-xs font-semibold">
            End of agreement
          </p>
        </div>
        <p className="text-muted-foreground mt-1 text-xs" aria-live="polite">
          {scrolled
            ? 'You have reached the end of the agreement.'
            : 'Scroll to the end of the agreement to continue.'}
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-brand-dark mb-2 font-semibold">Please confirm each point</legend>
        {ticks.map((t) => (
          <div key={t.id} className="flex items-start gap-3">
            <Checkbox
              id={`tick-${t.id}`}
              checked={Boolean(ticked[t.id])}
              onCheckedChange={(v) => setTicked((s) => ({ ...s, [t.id]: v === true }))}
              className="mt-0.5"
            />
            <Label htmlFor={`tick-${t.id}`} className="text-sm leading-snug font-normal">
              {t.label}
            </Label>
          </div>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="typed-name">Your full name</Label>
          <Input
            id="typed-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
        {titleLabel && (
          <div className="space-y-1">
            <Label htmlFor="signer-title">{titleLabel}</Label>
            <Input id="signer-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label>Your signature</Label>
        <SignatureCanvas onChange={setSignature} disabled={pending} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!codeSent ? (
        <div>
          <Button
            type="button"
            className="bg-brand-green hover:bg-brand-dark h-14 w-full text-lg font-semibold"
            disabled={!ready || pending}
            onClick={onSend}
          >
            {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
            Send my signing code
          </Button>
          {missing && <p className="text-muted-foreground mt-2 text-center text-sm">{missing}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sign-code">Enter the 6-digit code we sent to {phoneHint}</Label>
            <Input
              id="sign-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="h-12 text-lg tracking-widest"
            />
          </div>
          <Button
            type="button"
            className="bg-brand-green hover:bg-brand-dark h-14 w-full text-lg font-semibold"
            disabled={!ready || code.length !== 6 || pending}
            onClick={onSign}
          >
            {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
            Sign the agreement
          </Button>
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={onSend}
            disabled={pending}
          >
            Send a new code
          </Button>
        </div>
      )}
    </div>
  )
}
