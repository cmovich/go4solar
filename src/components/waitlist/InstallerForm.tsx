'use client'

import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CONSENT_TEXT, ESTIMATE_STATES, STATE_LABELS } from '@/lib/waitlist/schema'

import { submitInstaller } from '@/app/(public)/partners/installer/actions'

type StateId = (typeof ESTIMATE_STATES)[number]

export function InstallerForm() {
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [states, setStates] = useState<StateId[]>([])
  const [pending, startTransition] = useTransition()

  function toggleState(id: StateId) {
    setStates((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const f = new FormData(e.currentTarget)
    const str = (k: string) => String(f.get(k) ?? '').trim()
    const num = (k: string) => (str(k) === '' ? 0 : Number(str(k)))
    const input = {
      name: str('name'),
      businessName: str('businessName') || undefined,
      phone: str('phone'),
      whatsapp: str('whatsapp') || undefined,
      email: str('email'),
      states,
      lgas: str('lgas') || undefined,
      yearsInBusiness: num('yearsInBusiness'),
      installationsCompleted: num('installationsCompleted'),
      cacRegistered: f.get('cacRegistered') === 'yes',
      consent: f.get('consent') === 'on',
    }
    startTransition(async () => {
      const r = await submitInstaller(input)
      if (r.ok) setDone(r.name)
      else setError(r.error)
    })
  }

  if (done) {
    return (
      <div className="bg-brand-mist rounded-2xl p-8 text-center" role="status">
        <p className="text-brand-dark text-2xl font-bold">Thank you, {done}.</p>
        <p className="text-muted-foreground mt-2 text-base">We will contact you within 7 days.</p>
      </div>
    )
  }

  const field = 'mt-1 h-11 text-base'

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required className={field} />
        </div>
        <div>
          <Label htmlFor="businessName">Business name (optional)</Label>
          <Input
            id="businessName"
            name="businessName"
            autoComplete="organization"
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="whatsapp">WhatsApp (if different)</Label>
          <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" className={field} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className={field}
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">States you serve</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ESTIMATE_STATES.map((id) => (
            <label
              key={id}
              className="hover:bg-brand-mist flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
            >
              <input
                type="checkbox"
                checked={states.includes(id)}
                onChange={() => toggleState(id)}
                className="accent-brand-green h-4 w-4"
              />
              {STATE_LABELS[id]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="lgas">Local government areas you cover</Label>
        <Input id="lgas" name="lgas" placeholder="e.g. Gwarinpa, Kubwa, Lugbe" className={field} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="yearsInBusiness">Years in business</Label>
          <Input
            id="yearsInBusiness"
            name="yearsInBusiness"
            type="number"
            inputMode="numeric"
            min={0}
            max={80}
            required
            className={field}
          />
        </div>
        <div>
          <Label htmlFor="installationsCompleted">Installations completed</Label>
          <Input
            id="installationsCompleted"
            name="installationsCompleted"
            type="number"
            inputMode="numeric"
            min={0}
            required
            className={field}
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">CAC registered?</legend>
        <div className="mt-2 flex gap-3">
          {(['yes', 'no'] as const).map((v) => (
            <label
              key={v}
              className="hover:bg-brand-mist flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm"
            >
              <input
                type="radio"
                name="cacRegistered"
                value={v}
                defaultChecked={v === 'no'}
                className="accent-brand-green h-4 w-4"
              />
              {v === 'yes' ? 'Yes' : 'No'}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="consent"
          className="accent-brand-green mt-1 h-4 w-4 shrink-0"
        />
        <span>{CONSENT_TEXT}</span>
      </label>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="h-12 w-full text-base sm:w-auto" disabled={pending}>
        {pending ? 'Sending…' : 'Join as a partner installer'}
      </Button>
    </form>
  )
}
