'use client'

import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'

/** Money input that formats with thousands separators while typing; value is whole naira. */
export function NairaField({
  id,
  name,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string
  name?: string
  value: number
  onChange: (value: number) => void
  className?: string
  'aria-label'?: string
}) {
  const [text, setText] = useState(value.toLocaleString('en-US'))
  // Keep the box in step when the parent resets the draft (Discard).
  useEffect(() => {
    setText(value.toLocaleString('en-US'))
  }, [value])

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '')
    const n = digits === '' ? 0 : Math.min(1_000_000_000_000, parseInt(digits, 10))
    setText(digits === '' ? '' : n.toLocaleString('en-US'))
    onChange(n)
  }

  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
        ₦
      </span>
      <Input
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => handle(e.target.value)}
        onBlur={() => setText(value.toLocaleString('en-US'))}
        className={`h-10 pl-7 text-sm tabular-nums ${className ?? ''}`}
      />
    </div>
  )
}

/** Percentage input: shows "12.5", stores a decimal share (0.125). */
export function PercentField({
  id,
  value,
  onChange,
  step = 0.1,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: number
  onChange: (share: number) => void
  step?: number
  'aria-label'?: string
}) {
  const shown = Math.round(value * 10000) / 100
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        aria-label={ariaLabel}
        value={Number.isFinite(shown) ? shown : 0}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          onChange(Number.isNaN(n) ? 0 : Math.max(0, n) / 100)
        }}
        className="h-10 pr-7 text-sm tabular-nums"
      />
      <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
        %
      </span>
    </div>
  )
}
