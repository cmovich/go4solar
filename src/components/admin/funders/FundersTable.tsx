'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { NairaField, PercentField } from '@/components/admin/NairaField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNaira, formatPercent } from '@/lib/money'
import type { FunderDraft } from '@/lib/pricing/adminSchemas'
import { TENURES, type TenureMonths } from '@/lib/pricing/types'

import { saveFunder } from '@/app/admin/(shell)/funders/actions'

export type FunderRowView = FunderDraft & {
  id: string
  sample: boolean
  /** Loan book totals (empty until Prompt 12/13 create loans). */
  book: { drawn: number; repaid: number; outstanding: number; loans: number }
}

const EMPTY: FunderDraft = {
  name: '',
  kind: 'external',
  annualRate: 0.16,
  method: 'flat',
  upfrontFeeShare: 0,
  minAmount: 0,
  maxAmount: null,
  maxTenure: 12,
  balanceAvailable: 0,
  status: 'active',
}

export function FundersTable({ rows, canEdit }: { rows: FunderRowView[]; canEdit: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState<FunderDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    if (!editing) return
    setError(null)
    start(async () => {
      const r = await saveFunder(editing)
      if (r.ok) {
        setEditing(null)
        router.refresh()
      } else setError(r.error)
    })
  }

  function togglePause(f: FunderRowView) {
    start(async () => {
      const r = await saveFunder({ ...f, status: f.status === 'active' ? 'paused' : 'active' })
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  }

  const set = (patch: Partial<FunderDraft>) => setEditing((e) => (e ? { ...e, ...patch } : e))

  return (
    <>
      {canEdit && (
        <Button type="button" onClick={() => setEditing(EMPTY)} className="mb-4">
          Add funder
        </Button>
      )}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm" data-testid="funders-table">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {[
                'Funder',
                'Rate',
                'Method',
                'Ticket',
                'Max tenure',
                'Balance available',
                'Loan book',
                'Status',
                '',
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr key={f.id} className={i % 2 ? 'bg-brand-mist/60' : 'bg-white'}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="text-brand-dark font-semibold">{f.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {f.kind === 'own_fund' ? 'Go4Solar own fund' : 'External'}
                  </span>
                  {f.sample && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      SAMPLE
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">{formatPercent(f.annualRate, 1)}/yr</td>
                <td className="px-3 py-2">{f.method}</td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {formatNaira(f.minAmount)} –{' '}
                  {f.maxAmount === null ? 'no max' : formatNaira(f.maxAmount)}
                </td>
                <td className="px-3 py-2">{f.maxTenure} mo</td>
                <td className="px-3 py-2 tabular-nums">{formatNaira(f.balanceAvailable)}</td>
                <td className="px-3 py-2 text-xs tabular-nums">
                  {f.book.loans} loans · drawn {formatNaira(f.book.drawn)} · outstanding{' '}
                  {formatNaira(f.book.outstanding)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${f.status === 'active' ? 'bg-brand-green text-white' : 'bg-gray-200 text-gray-700'}`}
                  >
                    {f.status}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {canEdit && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(f)}
                      >
                        Edit
                      </Button>{' '}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => togglePause(f)}
                        disabled={pending}
                      >
                        {f.status === 'active' ? 'Pause' : 'Resume'}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-muted-foreground px-3 py-6 text-center">
                  No funders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle className="text-brand-dark">
                  {editing.id ? 'Edit funder' : 'Add funder'}
                </DialogTitle>
                <DialogDescription>
                  What this funder charges Go4Solar. Customer prices come from the financing rates,
                  not from here.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="f-name">Name</Label>
                  <Input
                    id="f-name"
                    value={editing.name}
                    onChange={(e) => set({ name: e.target.value })}
                    className="h-10"
                  />
                </div>
                <div>
                  <Label htmlFor="f-kind">Kind</Label>
                  <select
                    id="f-kind"
                    value={editing.kind}
                    onChange={(e) => set({ kind: e.target.value as FunderDraft['kind'] })}
                    className="border-input h-10 w-full rounded-md border bg-white px-2 text-sm"
                  >
                    <option value="external">External funder</option>
                    <option value="own_fund">Go4Solar own fund</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="f-method">Method</Label>
                  <select
                    id="f-method"
                    value={editing.method}
                    onChange={(e) => set({ method: e.target.value as FunderDraft['method'] })}
                    className="border-input h-10 w-full rounded-md border bg-white px-2 text-sm"
                  >
                    <option value="flat">Flat</option>
                    <option value="reducing">Reducing balance</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="f-rate">Interest rate per year</Label>
                  <PercentField
                    id="f-rate"
                    value={editing.annualRate}
                    onChange={(v) => set({ annualRate: v })}
                  />
                </div>
                <div>
                  <Label htmlFor="f-fee">Upfront fee</Label>
                  <PercentField
                    id="f-fee"
                    value={editing.upfrontFeeShare}
                    onChange={(v) => set({ upfrontFeeShare: v })}
                  />
                </div>
                <div>
                  <Label htmlFor="f-min">Minimum amount</Label>
                  <NairaField
                    id="f-min"
                    value={editing.minAmount}
                    onChange={(v) => set({ minAmount: v })}
                  />
                </div>
                <div>
                  <Label htmlFor="f-max">Maximum amount</Label>
                  <NairaField
                    id="f-max"
                    value={editing.maxAmount ?? 0}
                    onChange={(v) => set({ maxAmount: v === 0 ? null : v })}
                  />
                  <p className="text-muted-foreground mt-1 text-xs">0 = no maximum</p>
                </div>
                <div>
                  <Label htmlFor="f-tenure">Max tenure</Label>
                  <select
                    id="f-tenure"
                    value={editing.maxTenure}
                    onChange={(e) => set({ maxTenure: Number(e.target.value) as TenureMonths })}
                    className="border-input h-10 w-full rounded-md border bg-white px-2 text-sm"
                  >
                    {TENURES.map((t) => (
                      <option key={t} value={t}>
                        {t} months
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="f-balance">Balance available</Label>
                  <NairaField
                    id="f-balance"
                    value={editing.balanceAvailable}
                    onChange={(v) => set({ balanceAvailable: v })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox
                    checked={editing.status === 'active'}
                    onCheckedChange={(v) => set({ status: v === true ? 'active' : 'paused' })}
                  />
                  Active (eligible at approval)
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={submit} disabled={pending}>
                  {pending ? 'Saving…' : 'Save funder'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
