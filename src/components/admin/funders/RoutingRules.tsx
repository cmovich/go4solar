'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { APPLICANT_TYPE_LABELS, type RoutingRule } from '@/lib/funderQueue/routingRules'

import { saveRoutingRule } from '@/app/admin/(shell)/funders/actions'

const LENGTHS = [3, 6, 9, 12, 18, 24] as const
const select = 'border-input mt-1 block h-10 w-full rounded-md border bg-white px-2 text-sm'

/**
 * Admin → Funders → Routing rules: which files go to which funder's approval queue once the
 * deposit is paid. The default rule with the SPEWA offer also prices that customer type.
 */
export function RoutingRules({
  rules,
  funders,
  canEdit,
}: {
  rules: RoutingRule[]
  funders: { id: string; name: string }[]
  canEdit: boolean
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const funderName = (id: string) => funders.find((f) => f.id === id)?.name ?? 'Unknown funder'

  function save(e: React.FormEvent<HTMLFormElement>, rule?: RoutingRule) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const input = {
      id: rule?.id,
      funderId: String(f.get('funderId')),
      applicantType: String(f.get('applicantType')),
      minDepositShare: Number(f.get('minDeposit')),
      tenures: LENGTHS.filter((t) => f.get(`t${t}`) === 'on'),
      offer: f.get('offer') === 'spewa' ? 'spewa' : null,
      isDefault: f.get('isDefault') === 'on',
      active: f.get('active') === 'on',
      sortOrder: rule?.sortOrder ?? rules.length + 1,
    }
    start(async () => {
      setError(null)
      const r = await saveRoutingRule(input)
      if (!r.ok) return setError(r.error)
      setEditing(null)
      router.refresh()
    })
  }

  const editor = (rule?: RoutingRule) => (
    <form
      onSubmit={(e) => save(e, rule)}
      className="bg-brand-mist space-y-3 rounded-xl p-3"
      data-testid="routing-editor"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor={`r-funder-${rule?.id ?? 'new'}`}>Funder</Label>
          <select
            id={`r-funder-${rule?.id ?? 'new'}`}
            name="funderId"
            defaultValue={rule?.funderId ?? funders[0]?.id}
            className={select}
          >
            {funders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`r-type-${rule?.id ?? 'new'}`}>Customer type</Label>
          <select
            id={`r-type-${rule?.id ?? 'new'}`}
            name="applicantType"
            defaultValue={rule?.applicantType ?? 'business'}
            className={select}
          >
            <option value="business">{APPLICANT_TYPE_LABELS.business}</option>
            <option value="individual">{APPLICANT_TYPE_LABELS.individual}</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`r-min-${rule?.id ?? 'new'}`}>Minimum deposit (%)</Label>
          <Input
            id={`r-min-${rule?.id ?? 'new'}`}
            name="minDeposit"
            inputMode="decimal"
            defaultValue={rule ? Math.round(rule.minDepositShare * 1000) / 10 : 30}
            className="mt-1 h-10 bg-white"
          />
        </div>
        <div>
          <Label htmlFor={`r-offer-${rule?.id ?? 'new'}`}>Pricing</Label>
          <select
            id={`r-offer-${rule?.id ?? 'new'}`}
            name="offer"
            defaultValue={rule?.offer ?? ''}
            className={select}
          >
            <option value="">Normal pricing</option>
            <option value="spewa">SPEWA offer</option>
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Lengths</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {LENGTHS.map((t) => (
            <label key={t} className="flex min-h-10 items-center gap-1">
              <input
                type="checkbox"
                name={`t${t}`}
                defaultChecked={rule ? rule.tenures.includes(t) : t <= 12}
              />
              {t} months
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="isDefault" defaultChecked={rule?.isDefault ?? false} />
          Default for this customer type
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} />
          Active
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save rule'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setEditing(null)}>
          Cancel
        </Button>
      </div>
    </form>
  )

  return (
    <section className="mt-10 space-y-3" data-testid="routing-rules">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-brand-dark text-xl font-semibold">Routing rules</h2>
          <p className="text-muted-foreground max-w-3xl text-sm">
            A file that matches an active rule goes to that funder&rsquo;s approval queue once the
            deposit is paid. The default rule with the SPEWA offer also prices that customer type
            (minimum deposit and lengths).
          </p>
        </div>
        {canEdit && (
          <Button type="button" size="sm" onClick={() => setEditing('new')}>
            Add rule
          </Button>
        )}
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {editing === 'new' && editor()}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              <th className="px-3 py-2">Funder</th>
              <th className="px-3 py-2">Customer type</th>
              <th className="px-3 py-2">Minimum deposit</th>
              <th className="px-3 py-2">Lengths</th>
              <th className="px-3 py-2">Pricing</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-3 py-3">
                  No rules: every file goes to the general approval queue.
                </td>
              </tr>
            )}
            {rules.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                funder={funderName(r.funderId)}
                canEdit={canEdit}
                editing={editing === r.id}
                onEdit={() => setEditing(editing === r.id ? null : r.id)}
                editor={editor(r)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RuleRow({
  rule: r,
  funder,
  canEdit,
  editing,
  onEdit,
  editor,
}: {
  rule: RoutingRule
  funder: string
  canEdit: boolean
  editing: boolean
  onEdit: () => void
  editor: React.ReactNode
}) {
  return (
    <>
      <tr className="border-t" data-testid={`routing-rule-${r.id}`}>
        <td className="px-3 py-2 font-medium">{funder}</td>
        <td className="px-3 py-2">{APPLICANT_TYPE_LABELS[r.applicantType]}</td>
        <td className="px-3 py-2 tabular-nums">{Math.round(r.minDepositShare * 1000) / 10}%</td>
        <td className="px-3 py-2">{r.tenures.join(', ')} months</td>
        <td className="px-3 py-2">{r.offer === 'spewa' ? 'SPEWA offer' : 'Normal'}</td>
        <td className="px-3 py-2">
          {r.active ? 'Active' : 'Off'}
          {r.isDefault ? ' · default' : ''}
        </td>
        <td className="px-3 py-2">
          {canEdit && (
            <Button type="button" size="sm" variant="outline" onClick={onEdit}>
              {editing ? 'Close' : 'Edit'}
            </Button>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7} className="p-2">
            {editor}
          </td>
        </tr>
      )}
    </>
  )
}
