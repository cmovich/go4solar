'use client'

import { useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Money box with live ₦ formatting ("₦12,000") and an "I don't know" tick that stores null.
 * Value is whole naira or null.
 */
export function NairaInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  value: number | null
  onChange: (value: number | null) => void
  hint?: string
}) {
  const [unknown, setUnknown] = useState(false)
  const [text, setText] = useState(value === null ? '' : value.toLocaleString('en-US'))

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (digits === '') {
      setText('')
      onChange(null)
      return
    }
    const n = Math.min(100_000_000, parseInt(digits, 10))
    setText(n.toLocaleString('en-US'))
    onChange(n)
  }

  function toggleUnknown(next: boolean) {
    setUnknown(next)
    if (next) {
      setText('')
      onChange(null)
    }
  }

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1">
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-base">
          ₦
        </span>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={text}
          disabled={unknown}
          onChange={(e) => handle(e.target.value)}
          className="h-12 pl-8 text-base tabular-nums"
        />
      </div>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
      <label className="mt-2 flex min-h-9 cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={unknown} onCheckedChange={(v) => toggleUnknown(v === true)} />I
        don&apos;t know
      </label>
    </div>
  )
}
