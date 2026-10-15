'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GUARANTOR_RELATIONSHIPS } from '@/lib/applications/relationships'

export type RelationshipValue = { relationship: string; relationshipOther: string }

const select = 'border-input mt-1 h-12 w-full rounded-md border bg-white px-3 text-base'

/** Guarantor relationship: a dropdown, plus a short text box when "Other" is chosen. */
export function RelationshipField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: RelationshipValue
  onChange: (v: RelationshipValue) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <select
          id={id}
          value={value.relationship}
          onChange={(e) => onChange({ ...value, relationship: e.target.value })}
          className={select}
        >
          <option value="" disabled>
            Choose one
          </option>
          {GUARANTOR_RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {value.relationship === 'Other' && (
        <div>
          <Label htmlFor={`${id}-other`}>How do you know them?</Label>
          <Input
            id={`${id}-other`}
            maxLength={40}
            placeholder="e.g. landlord"
            value={value.relationshipOther}
            onChange={(e) => onChange({ ...value, relationshipOther: e.target.value })}
            className="mt-1 h-12 text-base"
          />
        </div>
      )}
    </div>
  )
}
