'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNaira } from '@/lib/money'
import type { OfferTermsFormInput } from '@/lib/spewa/adminSchemas'
import {
  COLUMN_LABELS,
  PRICE_COLUMNS,
  SPEWA_CATEGORIES,
  SPEWA_KINDS,
  type PriceColumn,
  type SpewaItem,
} from '@/lib/spewa/priceList'

import {
  deleteSpewaItem,
  saveSpewaItem,
  saveSpewaTerms,
  setSpewaItemActive,
} from '@/app/admin/(shell)/pricing/spewa/actions'

type Row = SpewaItem & { flags: string[] }

const select = 'border-input mt-1 block h-10 w-full rounded-md border bg-white px-2 text-sm'
const KIND_LABELS: Record<(typeof SPEWA_KINDS)[number], string> = {
  inverter: 'Inverter',
  battery: 'Battery',
  panel: 'Panel',
  light: 'Light',
  other: 'Other (not quoted)',
}

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[,\s₦]/g, '')))

function sizeText(i: SpewaItem) {
  if (i.kind === 'inverter')
    return `${i.ratingKw ?? '?'} kW · ${i.highVoltage ? 'HV' : `${i.voltage ?? '?'} V`}`
  if (i.kind === 'battery')
    return `${i.kwh ?? '?'} kWh · ${i.highVoltage ? 'HV' : `${i.voltage ?? '?'} V`}`
  if (i.kind === 'panel') return `${i.watts ?? '?'} W`
  if (i.kind === 'light') return i.watts ? `${i.watts} W` : 'Light'
  return '—'
}

/** Admin → Pricing → SPEWA price list: the offer terms, then the items. */
export function SpewaPriceListAdmin({
  items,
  terms,
}: {
  items: Row[]
  terms: OfferTermsFormInput
}) {
  const [category, setCategory] = useState<string>('all')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const shown = useMemo(
    () => (category === 'all' ? items : items.filter((i) => i.category === category)),
    [items, category],
  )
  const flagged = items.filter((i) => i.flags.length > 0).length
  const partner = terms.partnerColumn as PriceColumn
  const selling = terms.sellingColumn as PriceColumn

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setNotice(null)
      const r = await fn()
      if (!r.ok) return setNotice({ ok: false, text: r.error ?? 'Something went wrong.' })
      setNotice({ ok: true, text: done })
      setEditing(null)
      router.refresh()
    })

  return (
    <div className="space-y-6" data-testid="spewa-admin">
      <div>
        <h2 className="text-brand-dark text-xl font-semibold">SPEWA price list</h2>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Businesses and institutions are quoted with these items (the SPEWA offer). Customers pay
          the <strong>selling price</strong>; SPEWA is paid the <strong>partner price</strong>.
          Installation, cables and accessories come from our own pricing.
        </p>
      </div>

      <TermsForm terms={terms} pending={pending} onSave={run} />

      {notice && (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={`text-sm ${notice.ok ? 'text-brand-green' : 'text-destructive'}`}
          data-testid="spewa-notice"
        >
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {['all', ...SPEWA_CATEGORIES].map((c) => (
          <Button
            key={c}
            type="button"
            size="sm"
            variant={category === c ? 'default' : 'outline'}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c === 'all' ? `All (${items.length})` : c}
          </Button>
        ))}
        <span className="flex-1" />
        {flagged > 0 && (
          <span className="text-sm text-amber-900" data-testid="spewa-flag-count">
            {flagged} {flagged === 1 ? 'item needs' : 'items need'} a look
          </span>
        )}
        <Button type="button" size="sm" onClick={() => setEditing('new')}>
          Add item
        </Button>
      </div>

      {editing === 'new' && (
        <ItemEditor
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(v) => run(() => saveSpewaItem(v), 'Item added.')}
        />
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              <th className="px-2 py-2">No</th>
              <th className="px-2 py-2">Product</th>
              {PRICE_COLUMNS.map((c) => (
                <th key={c} className="px-2 py-2 text-right">
                  {COLUMN_LABELS[c]}
                  {c === partner && <span className="block text-xs font-normal">Partner</span>}
                  {c === selling && <span className="block text-xs font-normal">Selling</span>}
                </th>
              ))}
              <th className="px-2 py-2">Type and size</th>
              <th className="px-2 py-2">On</th>
              <th className="px-2 py-2">Check</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <ItemRows
                key={i.id}
                item={i}
                partner={partner}
                selling={selling}
                editing={editing === i.id}
                pending={pending}
                onEdit={() => setEditing(editing === i.id ? null : i.id)}
                onSave={(v) => run(() => saveSpewaItem(v), `${i.code} saved.`)}
                onToggle={() =>
                  run(
                    () => setSpewaItemActive({ id: i.id, active: !i.active }),
                    `${i.code} switched ${i.active ? 'off' : 'on'}.`,
                  )
                }
                onDelete={() => {
                  if (window.confirm(`Remove ${i.code} (${i.product}) from the price list?`)) {
                    run(() => deleteSpewaItem({ id: i.id }), `${i.code} removed.`)
                  }
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ItemRows({
  item: i,
  partner,
  selling,
  editing,
  pending,
  onEdit,
  onSave,
  onToggle,
  onDelete,
}: {
  item: Row
  partner: PriceColumn
  selling: PriceColumn
  editing: boolean
  pending: boolean
  onEdit: () => void
  onSave: (v: unknown) => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <>
      <tr
        className={`border-t align-top ${i.active ? '' : 'text-muted-foreground'}`}
        data-testid={`spewa-row-${i.itemNo ?? i.code}`}
      >
        <td className="px-2 py-2 tabular-nums">{i.itemNo ?? '—'}</td>
        <td className="px-2 py-2">
          <span className="text-brand-dark font-medium">{i.product}</span>
          <span className="text-muted-foreground block text-xs">
            {i.code}
            {i.brand ? ` · ${i.brand}` : ''}
            {i.warranty ? ` · ${i.warranty}` : ''}
          </span>
        </td>
        {PRICE_COLUMNS.map((c) => (
          <td
            key={c}
            className={`px-2 py-2 text-right tabular-nums ${c === partner || c === selling ? 'bg-brand-mist font-semibold' : ''}`}
          >
            {i.prices[c] === null ? '—' : formatNaira(i.prices[c]!)}
          </td>
        ))}
        <td className="px-2 py-2">
          {KIND_LABELS[i.kind]}
          <span className="text-muted-foreground block text-xs">{sizeText(i)}</span>
        </td>
        <td className="px-2 py-2">
          <Button
            type="button"
            size="sm"
            variant={i.active ? 'default' : 'outline'}
            aria-pressed={i.active}
            aria-label={`${i.code} ${i.active ? 'on' : 'off'}`}
            disabled={pending}
            onClick={onToggle}
          >
            {i.active ? 'On' : 'Off'}
          </Button>
        </td>
        <td className="px-2 py-2 text-xs text-amber-900" data-testid={`spewa-flags-${i.code}`}>
          {i.flags.length === 0 ? (
            <span className="text-muted-foreground">OK</span>
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              {i.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            {editing ? 'Close' : 'Edit'}
          </Button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={11} className="bg-brand-mist p-3">
            <ItemEditor
              item={i}
              pending={pending}
              onCancel={onEdit}
              onSave={onSave}
              onDelete={onDelete}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function ItemEditor({
  item,
  pending,
  onSave,
  onCancel,
  onDelete,
}: {
  item?: SpewaItem
  pending: boolean
  onSave: (v: unknown) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const key = item?.id ?? 'new'
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const str = (k: string) => String(f.get(k) ?? '')
    onSave({
      id: item?.id,
      itemNo: numOrNull(str('itemNo')),
      category: str('category'),
      code: str('code'),
      product: str('product'),
      brand: str('brand'),
      warranty: str('warranty'),
      prices: Object.fromEntries(PRICE_COLUMNS.map((c) => [c, numOrNull(str(c))])),
      kind: str('kind'),
      ratingKw: numOrNull(str('ratingKw')),
      voltage: numOrNull(str('voltage')),
      highVoltage: f.get('highVoltage') === 'on',
      kwh: numOrNull(str('kwh')),
      watts: numOrNull(str('watts')),
      active: f.get('active') === 'on',
      sortOrder: numOrNull(str('itemNo')) ?? item?.sortOrder ?? 999,
    })
  }
  const field = (name: string, label: string, value: string | number | null | undefined) => (
    <div>
      <Label htmlFor={`${key}-${name}`}>{label}</Label>
      <Input
        id={`${key}-${name}`}
        name={name}
        defaultValue={value ?? ''}
        inputMode={['product', 'code', 'brand', 'warranty'].includes(name) ? 'text' : 'decimal'}
        className="mt-1 h-10 bg-white"
      />
    </div>
  )
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border bg-white p-3"
      data-testid="spewa-editor"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {field('itemNo', 'No', item?.itemNo)}
        {field('code', 'Code', item?.code)}
        <div className="col-span-2">{field('product', 'Product', item?.product)}</div>
        <div>
          <Label htmlFor={`${key}-category`}>Category</Label>
          <select
            id={`${key}-category`}
            name="category"
            defaultValue={item?.category ?? 'Inverters'}
            className={select}
          >
            {SPEWA_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {field('brand', 'Brand', item?.brand)}
        {field('warranty', 'Warranty', item?.warranty)}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {PRICE_COLUMNS.map((c) => field(c, `${COLUMN_LABELS[c]} (₦)`, item?.prices[c]))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div>
          <Label htmlFor={`${key}-kind`}>Used as</Label>
          <select
            id={`${key}-kind`}
            name="kind"
            defaultValue={item?.kind ?? 'inverter'}
            className={select}
          >
            {SPEWA_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        {field('ratingKw', 'Inverter kW', item?.ratingKw)}
        {field('voltage', 'Voltage (V)', item?.voltage)}
        {field('kwh', 'Battery kWh', item?.kwh)}
        {field('watts', 'Watts (panel, light)', item?.watts)}
        <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="highVoltage" defaultChecked={item?.highVoltage ?? false} />
            High voltage
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={item?.active ?? true} />
            Switched on
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save item'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {onDelete && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
            Remove item
          </Button>
        )}
      </div>
    </form>
  )
}

function TermsForm({
  terms,
  pending,
  onSave,
}: {
  terms: OfferTermsFormInput
  pending: boolean
  onSave: (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => void
}) {
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const n = (k: string) => Number(String(f.get(k) ?? '').replace(',', '.'))
    const input = {
      partnerColumn: String(f.get('partnerColumn')),
      sellingColumn: String(f.get('sellingColumn')),
      priceListDate: String(f.get('priceListDate')),
      validityDays: n('validityDays'),
      charges: { 3: n('c3'), 6: n('c6'), 9: n('c9'), 12: n('c12') },
      badDebtPct: n('badDebtPct'),
      go4solarPct: n('go4solarPct'),
    }
    onSave(() => saveSpewaTerms(input), 'Offer terms saved.')
  }
  const columnSelect = (name: string, label: string, value: string) => (
    <div>
      <Label htmlFor={`terms-${name}`}>{label}</Label>
      <select id={`terms-${name}`} name={name} defaultValue={value} className={select}>
        {PRICE_COLUMNS.map((c) => (
          <option key={c} value={c}>
            {COLUMN_LABELS[c]}
          </option>
        ))}
      </select>
    </div>
  )
  const pctField = (name: string, label: string, value: number) => (
    <div>
      <Label htmlFor={`terms-${name}`}>{label}</Label>
      <Input
        id={`terms-${name}`}
        name={name}
        defaultValue={value}
        inputMode="decimal"
        className="mt-1 h-10 bg-white"
      />
    </div>
  )
  return (
    <form
      onSubmit={submit}
      className="bg-brand-mist space-y-4 rounded-2xl p-4"
      data-testid="spewa-terms"
    >
      <h3 className="text-brand-dark font-semibold">Offer terms</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {columnSelect('partnerColumn', 'Partner price (paid to SPEWA)', terms.partnerColumn)}
        {columnSelect('sellingColumn', 'Selling price (customers)', terms.sellingColumn)}
        <div>
          <Label htmlFor="terms-priceListDate">Price list date</Label>
          <Input
            id="terms-priceListDate"
            name="priceListDate"
            type="date"
            defaultValue={terms.priceListDate}
            className="mt-1 h-10 bg-white"
          />
        </div>
        <div>
          <Label htmlFor="terms-validityDays">Quotes valid for (days)</Label>
          <Input
            id="terms-validityDays"
            name="validityDays"
            inputMode="numeric"
            defaultValue={terms.validityDays}
            className="mt-1 h-10 bg-white"
          />
        </div>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">
          Charge on the financed amount (%), shown to customers only as one fixed total
        </legend>
        <div className="mt-1 grid grid-cols-2 gap-3 md:grid-cols-4">
          {pctField('c3', '3 months', terms.charges[3])}
          {pctField('c6', '6 months', terms.charges[6])}
          {pctField('c9', '9 months', terms.charges[9])}
          {pctField('c12', '12 months', terms.charges[12])}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {pctField('badDebtPct', 'Bad-debt provision (% of financed)', terms.badDebtPct)}
        {pctField('go4solarPct', "Go4Solar's share of profit (%)", terms.go4solarPct)}
      </div>
      <p className="text-muted-foreground text-xs">
        The minimum deposit (30%) and the lengths (3, 6, 9, 12 months) are set in the routing rule
        (Admin → Funders → Routing rules).
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save terms'}
      </Button>
    </form>
  )
}
