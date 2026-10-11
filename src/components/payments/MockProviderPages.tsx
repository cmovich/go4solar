'use client'

import { Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

import { completeMockCheckout, completeMockMandate } from '@/app/(consumer)/app/pay/actions'

const back = (next: string, reference: string) =>
  `${next}${next.includes('?') ? '&' : '?'}reference=${encodeURIComponent(reference)}`

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div
        className="rounded-2xl border-2 border-dashed border-amber-400 bg-white p-6"
        data-testid="mock-provider"
      >
        <p className="text-xs font-bold tracking-wide text-amber-700 uppercase">
          Test mode: no real money
        </p>
        <h1 className="text-brand-dark mt-1 text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  )
}

/** Stands in for Paystack's checkout page (card / transfer / USSD). */
export function MockCheckout({
  reference,
  amount,
  next,
}: {
  reference: string
  amount: string
  next: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const go = (outcome: 'success' | 'failed') =>
    start(async () => {
      const r = await completeMockCheckout({ reference, outcome })
      if (r.ok) window.location.assign(back(next, reference))
      else setError(r.error ?? 'Something went wrong.')
    })
  return (
    <Frame title="Test checkout">
      <p className="mt-2 text-sm">Reference {reference}</p>
      <p className="text-brand-dark mt-4 text-3xl font-bold">{amount}</p>
      <div className="mt-6 space-y-2">
        <Button
          className="bg-brand-green hover:bg-brand-dark h-12 w-full"
          disabled={pending}
          onClick={() => go('success')}
        >
          {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
          Pay {amount}
        </Button>
        <Button
          variant="outline"
          className="h-12 w-full"
          disabled={pending}
          onClick={() => go('failed')}
        >
          Simulate a failed payment
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </Frame>
  )
}

/** Stands in for the bank's direct-debit approval page. */
export function MockMandate({ reference, next }: { reference: string; next: string }) {
  const [pending, start] = useTransition()
  const [bank, setBank] = useState('Test Bank')
  const go = (outcome: 'success' | 'failed') =>
    start(async () => {
      const r = await completeMockMandate({ reference, outcome, bank })
      if (r.ok) window.location.assign(next)
    })
  return (
    <Frame title="Approve auto-pay (direct debit)">
      <p className="mt-2 text-sm">Your bank asks you to approve monthly payments to Go4Solar.</p>
      <div className="mt-4 space-y-1">
        <Label htmlFor="mock-bank">Bank</Label>
        <select
          id="mock-bank"
          className="border-input h-12 w-full rounded-md border bg-white px-3"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
        >
          {['Test Bank', 'Access Bank', 'GTBank', 'Zenith Bank', 'First Bank'].map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>
      <div className="mt-6 space-y-2">
        <Button
          className="bg-brand-green hover:bg-brand-dark h-12 w-full"
          disabled={pending}
          onClick={() => go('success')}
        >
          {pending && <Loader2 className="mr-2 size-5 animate-spin" />}
          Approve auto-pay
        </Button>
        <Button
          variant="outline"
          className="h-12 w-full"
          disabled={pending}
          onClick={() => go('failed')}
        >
          My bank is not supported
        </Button>
      </div>
    </Frame>
  )
}
