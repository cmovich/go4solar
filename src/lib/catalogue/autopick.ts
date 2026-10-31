/**
 * Part F: the accessories every auto quote gets, picked from the admin rules and the catalogue.
 * Pure: plain objects in, plain objects out.
 */

/** The accessories on every quote, in invoice order. */
export const ACCESSORY_KINDS = [
  'ac_surge',
  'dc_surge',
  'ac_breaker',
  'dc_breaker',
  'changeover',
  'voltage_regulator',
  'battery_breaker',
  'breaker_box',
  'trunk_pipe',
  'flex_pipe',
  'ac_wire',
  'dc_wire',
] as const
export type AccessoryKind = (typeof ACCESSORY_KINDS)[number]

export const KIND_LABELS: Record<AccessoryKind, string> = {
  ac_surge: 'AC surge protector',
  dc_surge: 'DC surge protector',
  ac_breaker: 'AC breaker',
  dc_breaker: 'DC breaker',
  changeover: 'Changeover switch',
  voltage_regulator: 'Voltage regulator',
  battery_breaker: 'Battery breaker',
  breaker_box: 'Breaker box',
  trunk_pipe: 'Trunk pipe',
  flex_pipe: 'Flex pipe',
  ac_wire: 'AC wire',
  dc_wire: 'DC wire',
}

/** The unit each kind's rating is in. */
export const RATING_UNITS: Record<AccessoryKind, string> = {
  ac_surge: 'kA',
  dc_surge: 'V',
  ac_breaker: 'A',
  dc_breaker: 'A',
  changeover: 'A',
  voltage_regulator: 'kVA',
  battery_breaker: 'A',
  breaker_box: 'ways',
  trunk_pipe: 'mm',
  flex_pipe: 'mm',
  ac_wire: 'mm²',
  dc_wire: 'mm²',
}

export type AccessoryRule = {
  maxKva: number
  dcBreakerA: number
  acBreakerA: number
  dcSurgeV: number
  acSurgeKa: number
  batteryBreakerA: number
  changeoverA: number
  regulatorKva: number
  boxWays: number
  trunkPipeMm: number
  flexPipeMm: number
  acWireMm2: number
  dcWireMm2: number
  trunkPipeM: number
  flexPipeM: number
}

export type CatalogueItem = {
  sku: string
  name: string
  kind: AccessoryKind
  rating: number
  unitCost: number
  unit: 'each' | 'metre'
}

export type AccessoryPick = CatalogueItem & { qty: number }

/** The rule for this inverter: the first whose max kVA covers it, else the largest. */
export function ruleFor(rules: AccessoryRule[], inverterKva: number): AccessoryRule | null {
  const sorted = [...rules].sort((a, b) => a.maxKva - b.maxKva)
  return sorted.find((r) => r.maxKva >= inverterKva - 1e-9) ?? sorted[sorted.length - 1] ?? null
}

/** Copper resistivity, Ω·mm²/m. */
const COPPER = 0.0175

/** Smallest DC cable (mm²) that keeps the voltage drop under maxDrop for this run (there and back). */
export function dcWireMm2(i: {
  lengthM: number
  currentA: number
  voltageV: number
  maxDrop: number
}): number {
  return (2 * i.lengthM * i.currentA * COPPER) / (i.maxDrop * i.voltageV)
}

/** The rating each kind needs from a rule. */
function wanted(rule: AccessoryRule, kind: AccessoryKind): number {
  switch (kind) {
    case 'ac_surge':
      return rule.acSurgeKa
    case 'dc_surge':
      return rule.dcSurgeV
    case 'ac_breaker':
      return rule.acBreakerA
    case 'dc_breaker':
      return rule.dcBreakerA
    case 'changeover':
      return rule.changeoverA
    case 'voltage_regulator':
      return rule.regulatorKva
    case 'battery_breaker':
      return rule.batteryBreakerA
    case 'breaker_box':
      return rule.boxWays
    case 'trunk_pipe':
      return rule.trunkPipeMm
    case 'flex_pipe':
      return rule.flexPipeMm
    case 'ac_wire':
      return rule.acWireMm2
    case 'dc_wire':
      return rule.dcWireMm2
  }
}

/** Smallest stocked item of this kind rated at least `rating` (else the largest stocked). */
export function bestItem(
  catalogue: CatalogueItem[],
  kind: AccessoryKind,
  rating: number,
): CatalogueItem | null {
  const ofKind = catalogue.filter((c) => c.kind === kind).sort((a, b) => a.rating - b.rating)
  return ofKind.find((c) => c.rating >= rating - 1e-9) ?? ofKind[ofKind.length - 1] ?? null
}

/**
 * One of each accessory for this system (pipes and wires by the metre). The DC cable is at least
 * the rule's size and thick enough to keep the voltage drop under the limit. Kinds with nothing
 * in the catalogue are left out; with no rules or no catalogue the result is empty (callers then
 * use the old accessories pack).
 */
export function autoPickAccessories(
  sys: {
    inverterKva: number
    /** One-way DC run, panels → inverter (m). */
    dcRunM: number
    /** DC cable to buy (m); defaults to the run there and back. */
    dcWireM?: number
    acRunM: number
    /** Current and voltage of one panel string (voltage-drop check). */
    stringCurrentA: number
    stringVoltageV: number
    maxDrop: number
  },
  rules: AccessoryRule[],
  catalogue: CatalogueItem[],
): AccessoryPick[] {
  const rule = ruleFor(rules, sys.inverterKva)
  if (!rule || catalogue.length === 0) return []
  const out: AccessoryPick[] = []
  for (const kind of ACCESSORY_KINDS) {
    let rating = wanted(rule, kind)
    if (kind === 'dc_wire') {
      rating = Math.max(
        rating,
        dcWireMm2({
          lengthM: sys.dcRunM,
          currentA: sys.stringCurrentA,
          voltageV: sys.stringVoltageV,
          maxDrop: sys.maxDrop,
        }),
      )
    }
    const pick = bestItem(catalogue, kind, rating)
    if (!pick) continue
    const qty =
      kind === 'trunk_pipe'
        ? rule.trunkPipeM
        : kind === 'flex_pipe'
          ? rule.flexPipeM
          : kind === 'ac_wire'
            ? Math.ceil(sys.acRunM)
            : kind === 'dc_wire'
              ? Math.ceil(sys.dcWireM ?? sys.dcRunM * 2)
              : 1
    out.push({ ...pick, qty })
  }
  return out
}
