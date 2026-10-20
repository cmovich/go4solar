/**
 * Technical specs of the price-list components (Part A). Pure: shared by the admin table, the
 * server action and the sizing engine. Values come from the manufacturer's datasheet.
 */
export type SpecCategory = 'panels' | 'battery' | 'inverter' | 'accessories'
export type SpecValue = number | string
export type Specs = Record<string, SpecValue | null | undefined>

type NumberField = {
  key: string
  label: string
  unit: string
  kind: 'number'
  min: number
  max: number
}
type ChoiceField = {
  key: string
  label: string
  unit: ''
  kind: 'choice'
  choices: readonly string[]
}
type TextField = { key: string; label: string; unit: ''; kind: 'text'; max: number }
export type SpecField = NumberField | ChoiceField | TextField

const n = (key: string, label: string, unit: string, min: number, max: number): NumberField => ({
  key,
  label,
  unit,
  kind: 'number',
  min,
  max,
})

export const CHEMISTRIES = [
  'LiFePO4',
  'Lithium-ion (NMC)',
  'Lead-acid (AGM)',
  'Lead-acid (gel)',
  'Lead-acid (flooded)',
  'Other',
] as const

export const NOMINAL_VOLTAGES = [12, 24, 48] as const

export const SPEC_FIELDS: Record<SpecCategory, SpecField[]> = {
  inverter: [
    n('ratedKva', 'rated kVA', 'kVA', 0.3, 100),
    n('ratedW', 'rated W', 'W', 200, 100_000),
    n('batteryV', 'battery voltage', 'V', 12, 800),
    n('maxPvW', 'max PV input W', 'W', 100, 200_000),
    n('maxPvVoc', 'max PV Voc', 'V', 20, 1500),
    n('mpptMin', 'MPPT min', 'V', 10, 1000),
    n('mpptMax', 'MPPT max', 'V', 10, 1500),
    n('maxChargeA', 'max charge current', 'A', 1, 1000),
    n('surgeW', 'surge W', 'W', 200, 500_000),
  ],
  battery: [
    n('nominalV', 'nominal V', 'V', 6, 800),
    n('capacityAh', 'capacity Ah', 'Ah', 1, 5000),
    n('capacityKwh', 'capacity kWh', 'kWh', 0.05, 500),
    { key: 'chemistry', label: 'chemistry', unit: '', kind: 'choice', choices: CHEMISTRIES },
    n('usableDod', 'usable DoD', '%', 10, 100),
    n('maxChargeA', 'max charge current', 'A', 1, 1000),
    n('maxDischargeA', 'max discharge current', 'A', 1, 2000),
  ],
  panels: [
    n('wp', 'Wp', 'W', 10, 1000),
    n('voc', 'Voc', 'V', 5, 120),
    n('vmp', 'Vmp', 'V', 5, 120),
    n('isc', 'Isc', 'A', 0.5, 30),
    n('imp', 'Imp', 'A', 0.5, 30),
    n('tempCoeffPmax', 'temperature coefficient of Pmax', '%/°C', -1, 0),
  ],
  accessories: [{ key: 'notes', label: 'specs', unit: '', kind: 'text', max: 500 }],
}

type Item = {
  category: SpecCategory
  nominalVoltage: number | null
  specs: Specs | null | undefined
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const num = (v: number) => (v < 0 ? `−${Math.abs(v)}` : String(v))
const present = (v: unknown) => v !== null && v !== undefined && v !== ''

/** What is still missing (accessories need nothing; others also need a nominal voltage). */
export function missingSpecs(c: Item): string[] {
  if (c.category === 'accessories') return []
  const specs = c.specs ?? {}
  return [
    ...(c.nominalVoltage === null ? ['nominal voltage'] : []),
    ...SPEC_FIELDS[c.category].filter((f) => !present(specs[f.key])).map((f) => f.label),
  ]
}

/** Values out of range or inconsistent with each other, in plain words. */
export function specProblems(c: Item): string[] {
  const specs = c.specs ?? {}
  const out: string[] = []
  for (const f of SPEC_FIELDS[c.category]) {
    const v = specs[f.key]
    if (!present(v)) continue
    if (f.kind === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max) {
        const unit = f.unit ? ` ${f.unit}` : ''
        out.push(`${cap(f.label)} must be between ${num(f.min)} and ${num(f.max)}${unit}`)
      }
    } else if (f.kind === 'choice') {
      if (!f.choices.includes(String(v))) out.push(`Choose a ${f.label} from the list`)
    } else if (String(v).length > f.max) {
      out.push(`Keep the ${f.label} to ${f.max} characters`)
    }
  }
  const val = (k: string) => (typeof specs[k] === 'number' ? (specs[k] as number) : null)
  if (c.category === 'panels') {
    const [voc, vmp, isc, imp] = [val('voc'), val('vmp'), val('isc'), val('imp')]
    if (voc !== null && vmp !== null && vmp >= voc) out.push('Vmp must be lower than Voc')
    if (isc !== null && imp !== null && imp > isc) out.push('Imp must not be higher than Isc')
  }
  if (c.category === 'inverter') {
    const [lo, hi, voc, w, surge] = [
      val('mpptMin'),
      val('mpptMax'),
      val('maxPvVoc'),
      val('ratedW'),
      val('surgeW'),
    ]
    if (lo !== null && hi !== null && lo >= hi) out.push('MPPT min must be lower than MPPT max')
    if (hi !== null && voc !== null && hi > voc)
      out.push('MPPT max must not be higher than max PV Voc')
    if (w !== null && surge !== null && surge < w) out.push('Surge W must be at least the rated W')
  }
  if (c.category === 'battery') {
    const [v, ah, kwh] = [val('nominalV'), val('capacityAh'), val('capacityKwh')]
    if (v !== null && ah !== null && kwh !== null) {
      const expected = Math.round(((v * ah) / 1000) * 100) / 100
      if (Math.abs(kwh - expected) > expected * 0.15) {
        out.push(`Capacity kWh does not match V × Ah (${v} V × ${ah} Ah ≈ ${expected} kWh)`)
      }
    }
  }
  return out
}

type Row = Item & { id: string; sku: string; active: boolean }

/**
 * Which active components the sizing engine and the system builder may use. Items with missing
 * specs are skipped with a note. While a whole category has no item with complete specs yet,
 * its items are still used (otherwise every quote would stop) and the category is flagged.
 */
export function usableComponents<T extends Row>(
  rows: T[],
): {
  usable: T[]
  skipped: { sku: string; reason: string }[]
  categoriesWithoutSpecs: SpecCategory[]
} {
  const active = rows.filter((r) => r.active)
  const complete = (r: T) => missingSpecs(r).length === 0
  const categories = [...new Set(active.map((r) => r.category))]
  const categoriesWithoutSpecs = categories.filter(
    (cat) => !active.some((r) => r.category === cat && complete(r)),
  )
  const usable: T[] = []
  const skipped: { sku: string; reason: string }[] = []
  for (const r of active) {
    if (complete(r) || categoriesWithoutSpecs.includes(r.category)) usable.push(r)
    else skipped.push({ sku: r.sku, reason: `Specs missing: ${missingSpecs(r).join(', ')}` })
  }
  return { usable, skipped, categoriesWithoutSpecs }
}
