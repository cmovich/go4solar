'use client'

import { Input } from '@/components/ui/input'
import {
  NOMINAL_VOLTAGES,
  SPEC_FIELDS,
  missingSpecs,
  specProblems,
  type SpecCategory,
} from '@/lib/components/specs'

type Value = number | string | null
type Specs = Record<string, Value>

/** Nominal voltage: 12 / 24 / 48 V or another value (Part A). */
export function VoltageField({
  value,
  onChange,
  label,
}: {
  value: number | null
  onChange: (v: number | null) => void
  label: string
}) {
  const preset =
    value === null
      ? ''
      : (NOMINAL_VOLTAGES as readonly number[]).includes(value)
        ? String(value)
        : 'other'
  return (
    <div className="flex items-center gap-1">
      <select
        value={preset}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? null : v === 'other' ? (value ?? 36) : Number(v))
        }}
        className="border-input h-9 rounded-md border bg-white px-2 text-sm"
        aria-label={label}
      >
        <option value="">—</option>
        {NOMINAL_VOLTAGES.map((v) => (
          <option key={v} value={v}>
            {v} V
          </option>
        ))}
        <option value="other">Other</option>
      </select>
      {preset === 'other' && (
        <Input
          type="number"
          inputMode="decimal"
          min={1}
          step="any"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="h-9 w-20 text-sm"
          aria-label={`${label} (other)`}
        />
      )}
    </div>
  )
}

/** Badge: are this row's specs complete? */
export function SpecsBadge({
  category,
  nominalVoltage,
  specs,
}: {
  category: SpecCategory
  nominalVoltage: number | null
  specs: Specs
}) {
  const missing = missingSpecs({ category, nominalVoltage, specs })
  if (missing.length === 0) {
    return <span className="text-brand-green text-xs font-semibold">Specs ✓</span>
  }
  return (
    <span
      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-amber-900"
      title={`Missing: ${missing.join(', ')}`}
      data-testid="specs-missing"
    >
      Specs missing
    </span>
  )
}

/** The expanded row: every spec for this category, with units and plain-English problems. */
export function SpecsEditor({
  sku,
  category,
  nominalVoltage,
  specs,
  skippedReason,
  onChange,
}: {
  sku: string
  category: SpecCategory
  nominalVoltage: number | null
  specs: Specs
  skippedReason: string | null
  onChange: (specs: Specs) => void
}) {
  const problems = specProblems({ category, nominalVoltage, specs })
  const set = (key: string, v: Value) => onChange({ ...specs, [key]: v })
  return (
    <div className="space-y-3 rounded-lg border bg-white p-3" data-testid={`specs-${sku || 'new'}`}>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SPEC_FIELDS[category].map((f) => {
          const id = `spec-${sku}-${f.key}`
          const v = specs[f.key] ?? null
          return (
            <label key={f.key} htmlFor={id} className="text-xs">
              <span className="font-medium capitalize">{f.label}</span>
              {f.unit && <span className="text-muted-foreground"> ({f.unit})</span>}
              {f.kind === 'number' && (
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={v ?? ''}
                  onChange={(e) =>
                    set(f.key, e.target.value === '' ? null : Number(e.target.value))
                  }
                  className="mt-1 h-9 text-sm"
                />
              )}
              {f.kind === 'choice' && (
                <select
                  id={id}
                  value={v === null ? '' : String(v)}
                  onChange={(e) => set(f.key, e.target.value || null)}
                  className="border-input mt-1 block h-9 w-full rounded-md border bg-white px-2 text-sm"
                >
                  <option value="">—</option>
                  {f.choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              {f.kind === 'text' && (
                <textarea
                  id={id}
                  value={v === null ? '' : String(v)}
                  maxLength={f.max}
                  rows={2}
                  onChange={(e) => set(f.key, e.target.value || null)}
                  className="border-input mt-1 block w-full rounded-md border bg-white px-2 py-1 text-sm sm:w-96"
                />
              )}
            </label>
          )
        })}
      </div>
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-700" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {skippedReason && (
        <p className="text-xs text-amber-900">
          Not used by quotes or the system builder until its specs are complete (
          {skippedReason.replace(/^Specs missing: /, 'missing: ')}).
        </p>
      )}
    </div>
  )
}
