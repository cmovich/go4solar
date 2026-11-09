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
  /** Not needed for "Specs ✓" (the engine has a setting for it). */
  optional?: true
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
    { ...n('maxAcChargeA', 'max grid (AC) charge current', 'A', 1, 1000), optional: true },
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
    n('lengthCm', 'length', 'cm', 50, 300),
    n('widthCm', 'width', 'cm', 30, 200),
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

/** What is still missing for the row to be complete ("Incomplete" badge). Never blocks quoting. */
export function missingSpecs(c: Item): string[] {
  if (c.category === 'accessories') return []
  const specs = c.specs ?? {}
  return [
    ...(c.nominalVoltage === null ? ['nominal voltage'] : []),
    ...SPEC_FIELDS[c.category]
      .filter((f) => !(f.kind === 'number' && f.optional) && !present(specs[f.key]))
      .map((f) => f.label),
  ]
}

/**
 * What an item needs to be quoted at all: the main columns of its row, never a datasheet spec.
 * Missing specs only make the row "Incomplete"; sizing fills the gaps with assumed values.
 */
export const NEEDED_TO_QUOTE: Record<SpecCategory, string[]> = {
  inverter: ['size (kVA)', 'unit cost'],
  panels: ['size (W)', 'unit cost'],
  battery: ['size (kWh)', 'unit cost'],
  accessories: ['size (max kVA)', 'unit cost'],
}

/** What a missing spec costs, in plain words (shown on the row). */
export const MISSING_EFFECT: Partial<Record<SpecCategory, string>> = {
  inverter: 'Missing values are filled with typical (assumed) ones for sizing.',
  panels:
    'Missing Voc/Vmp are filled with typical values. Without the length, a roof rack cannot be priced.',
  battery: 'Without the nominal voltage the battery is sized in steps instead of whole batteries.',
}

/**
 * Problems with the values that are filled in (numbers are numbers, sensible ranges). These block
 * saving. Empty fields are never a problem.
 */
export function specProblems(c: Item): string[] {
  const specs = c.specs ?? {}
  const out: string[] = []
  for (const f of SPEC_FIELDS[c.category]) {
    const v = specs[f.key]
    if (!present(v)) continue
    if (f.kind === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        out.push(`${cap(f.label)} must be a number`)
      } else if (v < f.min || v > f.max) {
        const unit = f.unit ? ` ${f.unit}` : ''
        out.push(`${cap(f.label)} must be between ${num(f.min)} and ${num(f.max)}${unit}`)
      }
    } else if (f.kind === 'choice') {
      if (!f.choices.includes(String(v))) out.push(`Choose a ${f.label} from the list`)
    } else if (String(v).length > f.max) {
      out.push(`Keep the ${f.label} to ${f.max} characters`)
    }
  }
  return out
}

/** Filled-in pairs that do not match each other. Shown as a warning; never block saving. */
export function specWarnings(c: Item): string[] {
  const specs = c.specs ?? {}
  const out: string[] = []
  const val = (k: string) => {
    const v = specs[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  if (c.category === 'panels') {
    const [voc, vmp, isc, imp] = [val('voc'), val('vmp'), val('isc'), val('imp')]
    if (voc !== null && vmp !== null && vmp >= voc) out.push('Vmp is usually lower than Voc')
    if (isc !== null && imp !== null && imp > isc) out.push('Imp is usually not higher than Isc')
  }
  if (c.category === 'inverter') {
    const [lo, hi, voc, w, surge] = [
      val('mpptMin'),
      val('mpptMax'),
      val('maxPvVoc'),
      val('ratedW'),
      val('surgeW'),
    ]
    if (lo !== null && hi !== null && lo >= hi) out.push('MPPT min is usually lower than MPPT max')
    if (hi !== null && voc !== null && hi > voc)
      out.push('MPPT max is usually not higher than max PV Voc')
    if (w !== null && surge !== null && surge < w)
      out.push('Surge W is usually at least the rated W')
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
