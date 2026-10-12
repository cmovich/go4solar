'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ENTRY_CHANNELS, ENTRY_CHANNEL_LABELS } from '@/lib/waitlist/schema'

import { newAssistedApplication } from '@/app/admin/(shell)/applications/actions'

export type LeadOption = {
  id: string
  name: string
  phone: string
  state: string
  email: string | null
}

const select = 'border-input h-11 w-full rounded-md border bg-white px-3'

/** Staff start an application for a customer; the customer finishes the identity steps themselves. */
export function AssistedApplicationForm({ leads }: { leads: LeadOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [leadId, setLeadId] = useState('')
  const [plan, setPlan] = useState<'essential' | 'comfort' | 'independence'>('comfort')
  const [tenure, setTenure] = useState(12)
  const [deposit, setDeposit] = useState(20)
  const [email, setEmail] = useState('')
  const [channel, setChannel] = useState<(typeof ENTRY_CHANNELS)[number]>('phone_call')
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads
      .filter((l) => !q || l.name.toLowerCase().includes(q) || l.phone.includes(q))
      .slice(0, 50)
  }, [leads, search])

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        start(async () => {
          const r = await newAssistedApplication({
            leadId,
            plan,
            tenure,
            depositShare: deposit / 100,
            email,
            channel,
          })
          if (r.ok) router.push(`/admin/applications/${r.applicationId}`)
          else setError(r.error)
        })
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="lead-search">Find the customer (name or phone)</Label>
        <Input id="lead-search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select
          aria-label="Customer"
          className={select}
          size={6}
          value={leadId}
          onChange={(e) => {
            setLeadId(e.target.value)
            const l = leads.find((x) => x.id === e.target.value)
            if (l?.email && !email) setEmail(l.email)
          }}
        >
          {shown.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.phone} · {l.state}
            </option>
          ))}
        </select>
        {leads.length === 0 && (
          <p className="text-sm font-semibold text-amber-800">
            No customer records yet. Add the customer on the waiting list first.
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Not listed? Add them first with “Add on behalf of customer” on the waiting list (it
          records their load).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="plan">Plan</Label>
          <select
            id="plan"
            className={select}
            value={plan}
            onChange={(e) => setPlan(e.target.value as typeof plan)}
          >
            <option value="essential">Essential</option>
            <option value="comfort">Comfort</option>
            <option value="independence">Independence</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tenure">Months</Label>
          <select
            id="tenure"
            className={select}
            value={tenure}
            onChange={(e) => setTenure(Number(e.target.value))}
          >
            {[3, 6, 9, 12].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="deposit">Deposit (%)</Label>
          <Input
            id="deposit"
            type="number"
            min={20}
            max={95}
            value={deposit}
            onChange={(e) => setDeposit(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="channel">How they reached us</Label>
          <select
            id="channel"
            className={select}
            value={channel}
            onChange={(e) => setChannel(e.target.value as typeof channel)}
          >
            {ENTRY_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {ENTRY_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="assisted-email">Customer email (their sign-in)</Label>
        <Input
          id="assisted-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        className="bg-brand-green hover:bg-brand-dark h-12 w-full"
        disabled={pending || !leadId}
      >
        Create and send the customer their link
      </Button>
      <p className="text-muted-foreground text-xs">
        The customer finishes NIN/BVN, consent, the face check, the signature with phone code, the
        deposit and auto-pay on their own phone. Until then the record shows “Awaiting customer”.
      </p>
    </form>
  )
}
