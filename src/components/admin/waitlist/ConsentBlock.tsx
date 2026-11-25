'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { ConsentFunder } from '@/lib/exports/readiness'

import { setLeadConsent } from '@/app/admin/(shell)/waitlist/profiles/actions'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/**
 * "Customer agreed we may share their details with: …" — one row per funder, ticked by staff on
 * the call (who, when, note). Unticking withdraws consent: if the person was already exported to
 * that funder, the funder's dashboard shows it and the funder's contact is emailed.
 */
export function ConsentBlock({
  waitlistId,
  funders,
  canTick,
}: {
  waitlistId: string
  funders: ConsentFunder[]
  canTick: boolean
}) {
  return (
    <section className="mt-6 space-y-3 rounded-xl border p-4" data-testid="consent-block">
      <h2 className="text-brand-dark font-semibold">
        Customer agreed we may share their details with:
      </h2>
      <p className="text-muted-foreground text-sm">
        Tick each funder the customer agreed to on the call. Nothing goes to a funder without it.
      </p>
      {funders.length === 0 && <p className="text-sm">No active funders.</p>}
      {funders.map((f) => (
        <ConsentRow key={f.id} waitlistId={waitlistId} f={f} canTick={canTick} />
      ))}
    </section>
  )
}

function ConsentRow({
  waitlistId,
  f,
  canTick,
}: {
  waitlistId: string
  f: ConsentFunder
  canTick: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const active = Boolean(f.consentedAt) && !f.withdrawnAt

  const save = (on: boolean) =>
    start(async () => {
      setError(null)
      setMessage(null)
      const r = await setLeadConsent({ waitlistId, funderId: f.id, on, note: note || null })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setConfirming(false)
      setNote('')
      if (!on && f.exportedIn.length > 0)
        setMessage(
          'notified' in r && r.notified
            ? `Consent withdrawn. ${f.name} was emailed to stop using and delete the details.`
            : `Consent withdrawn. ${f.name} has no contact email in Admin → Funders: tell them yourself to stop using and delete the details.`,
        )
      router.refresh()
    })

  return (
    <div
      className="rounded-lg border p-3 text-sm"
      data-testid="consent-funder"
      data-funder={f.name}
    >
      <label className="flex min-h-11 items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={active}
          disabled={pending || !canTick}
          onChange={(e) => (e.target.checked ? save(true) : setConfirming(true))}
          aria-label={f.name}
        />
        {f.name}
      </label>
      {active && f.consentedAt && (
        <p className="text-muted-foreground text-xs" data-testid="consent-who">
          Agreed: {f.consentedBy ?? 'Staff'}, {when(f.consentedAt)}
          {f.consentNote ? ` · “${f.consentNote}”` : ''}
        </p>
      )}
      {f.withdrawnAt && (
        <p className="text-xs font-semibold text-amber-900" data-testid="consent-withdrawn">
          Consent withdrawn: {f.withdrawnBy ?? 'Staff'}, {when(f.withdrawnAt)}
          {f.withdrawnNote ? ` · “${f.withdrawnNote}”` : ''}
          {f.funderToldAt ? ` · ${f.name} emailed ${when(f.funderToldAt)}` : ''}
        </p>
      )}
      {f.exportedIn.length > 0 && (
        <p className="text-muted-foreground text-xs">Exported in {f.exportedIn.join(', ')}</p>
      )}
      <p className="mt-1 text-xs" data-testid="consent-level">
        {f.level === 'full'
          ? 'Can be exported: Full'
          : f.level === 'basic'
            ? 'Can be exported: Basic (Full needs: ' + f.missing.join(', ') + ')'
            : 'Cannot be exported yet. Needs: ' + f.missing.join(', ')}
      </p>
      {f.level !== null && f.warnings.length > 0 && (
        <p className="text-xs text-amber-800" data-testid="consent-warnings">
          Missing: {f.warnings.join(', ')} (exported blank; {f.name} collects them)
        </p>
      )}
      {canTick && (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label={`${f.name}: note`}
          className="mt-2 h-9 bg-white"
          maxLength={500}
        />
      )}
      {confirming && (
        <div className="mt-2 rounded-md bg-amber-50 p-2 text-amber-900" role="alert">
          <p>
            Withdraw this customer’s consent for {f.name}? Nothing more will be exported to them.
            {f.exportedIn.length > 0 &&
              (f.hasContactEmail
                ? ` They already received the details (${f.exportedIn.join(', ')}): we will email them to stop using and delete them.`
                : ` They already received the details (${f.exportedIn.join(', ')}) but have no contact email: tell them yourself.`)}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => save(false)}
            >
              Withdraw consent
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Keep consent
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-destructive mt-1 text-sm" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="text-brand-green mt-1 text-sm" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
