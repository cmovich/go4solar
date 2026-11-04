'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { saveCompany } from '@/app/admin/(shell)/company/actions'

type Values = {
  name: string
  address: string
  phone: string
  email: string
  website: string
  rcNumber: string
  quoteValidityDays: number
}

const FIELDS: [keyof Omit<Values, 'quoteValidityDays'>, string, string][] = [
  ['name', 'Company name', 'organization'],
  ['address', 'Address', 'street-address'],
  ['phone', 'Phone', 'tel'],
  ['email', 'Email', 'email'],
  ['website', 'Website', 'url'],
  ['rcNumber', 'RC number (optional)', 'off'],
]

export function CompanyForm({ initial }: { initial: Values }) {
  const router = useRouter()
  const [v, setV] = useState<Values>(initial)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setMsg(null)
        start(async () => {
          const r = await saveCompany(v)
          setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.error })
          if (r.ok) router.refresh()
        })
      }}
      data-testid="company-form"
    >
      {FIELDS.map(([k, label, auto]) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`co-${k}`}>{label}</Label>
          <Input
            id={`co-${k}`}
            autoComplete={auto}
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
            className="h-11"
          />
        </div>
      ))}
      <div className="space-y-1">
        <Label htmlFor="co-days">Quotes and invoices are valid for (days)</Label>
        <Input
          id="co-days"
          type="number"
          min={1}
          max={90}
          value={v.quoteValidityDays}
          onChange={(e) => setV({ ...v, quoteValidityDays: Number(e.target.value) || 0 })}
          className="h-11 w-32"
        />
      </div>
      {msg && (
        <Alert variant={msg.ok ? 'default' : 'destructive'} role="status">
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? 'Saving…' : 'Save company details'}
      </Button>
    </form>
  )
}
