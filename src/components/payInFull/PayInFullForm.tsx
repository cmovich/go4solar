'use client'

import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNaira } from '@/lib/money'
import { stateLabel, type NgStateId } from '@/lib/nigeria/states'

import { payInFull } from '@/app/(consumer)/app/pay-in-full/actions'

type Address = { line1: string; city: string; state: string; lga: string }

/** The installation address, then "Pay ₦… now" (opens the checkout). */
export function PayInFullForm({
  amount,
  states,
  initial,
}: {
  amount: number
  states: NgStateId[]
  initial: Address
}) {
  const [a, setA] = useState<Address>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const field = (k: keyof Address, label: string) => (
    <div>
      <Label htmlFor={`pif-${k}`}>{label}</Label>
      <Input
        id={`pif-${k}`}
        value={a[k]}
        onChange={(e) => setA({ ...a, [k]: e.target.value })}
        className="mt-1 h-11"
      />
    </div>
  )
  return (
    <section className="space-y-4" data-testid="pif-form">
      <h2 className="text-brand-dark text-lg font-bold">Where should we install it?</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{field('line1', 'Street address')}</div>
        {field('city', 'Town or city')}
        {field('lga', 'Local government area')}
        <div>
          <Label htmlFor="pif-state">State</Label>
          <select
            id="pif-state"
            value={a.state}
            onChange={(e) => setA({ ...a, state: e.target.value })}
            className="border-input mt-1 block h-11 w-full rounded-md border bg-white px-3 text-base"
          >
            {states.map((s) => (
              <option key={s} value={s}>
                {stateLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        className="h-12 w-full text-base sm:w-auto sm:px-10"
        disabled={pending}
        data-testid="pif-pay"
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await payInFull(a)
            if (r.ok) window.location.assign(r.url)
            else setError(r.error)
          })
        }
      >
        {pending ? 'Opening the payment…' : `Pay ${formatNaira(amount)} now`}
      </Button>
    </section>
  )
}
