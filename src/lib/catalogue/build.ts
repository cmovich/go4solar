import type { NgStateId } from '@/lib/nigeria/states'
import { installBandFor } from '@/lib/pricing/tables'
import type { NoMarkupLine, QuoteLineInput } from '@/lib/pricing/types'
import type { InverterOption, PanelOption } from '@/lib/sizing/types'
import { quoteNotes, type SiteAnswers } from '@/lib/wizard/questions'

import type { AccessoryKind, AccessoryRule, CatalogueItem } from './autopick'
import { compatibility } from './compat'
import {
  OWN_INSTALLER_WARNING,
  installationCost,
  logisticsFor,
  rackLine,
  type LogisticsRow,
  type RackMaterial,
} from './extras'

/** Server-side catalogue with cost prices (never sent to the browser). */
export type FullCatalogue = {
  inverters: { sku: string; name: string; kva: number; unitCost: number; option: InverterOption }[]
  batteries: { sku: string; name: string; kwh: number; voltage: number | null; unitCost: number }[]
  panels: {
    sku: string
    name: string
    watts: number
    unitCost: number
    lengthCm: number | null
    option: PanelOption
  }[]
  /** Itemised accessories and the old "pack" tiers (kind 'pack', rating = max kVA). */
  accessories: (Omit<CatalogueItem, 'kind'> & { kind: AccessoryKind | 'pack' })[]
  rules?: AccessoryRule[]
  rackPrices: Partial<Record<RackMaterial, number>>
  settings: {
    railsPerPanel: number
    clampPricePerPanel: number
    extraPerStorey: number
    maxDcVoltageDrop: number
  }
  logistics: LogisticsRow[]
  /** A delivery or rack price is still SAMPLE: website prices stay hidden. */
  sample?: boolean
  installByState: Record<string, { small: number; medium: number; large: number }>
  roofTypes: {
    id: string
    name: string
    needsRack: boolean
    price: number
    unit: 'per_panel' | 'per_kw'
  }[]
}

export type BuildSelection = {
  scope: 'complete' | 'some'
  existing?: { brand: string; kva: number | null; batteryV: number | null }
  /** "I know my load" (kVA). */
  loadKva?: number | null
  state: NgStateId
  /** Chosen items by SKU; qty is metres for wires and pipes. */
  items: { sku: string; qty: number }[]
  site: SiteAnswers
  installer: 'go4solar' | 'own'
  /** The customer arranges delivery (only where local vendors exist). */
  ownDelivery?: boolean
}

export type AssembledBuild = {
  lines: QuoteLineInput[]
  noMarkup: NoMarkupLine[]
  installCost: number
  notes: string[]
  compat: { blocking: string[]; warnings: string[] }
}

/** Storeys above the ground from the building answer (feet → storeys of ~3 m). */
function storeysAbove(site: SiteAnswers): number {
  const b = site.building
  if (!b || (site.mounting && site.mounting !== 'roof')) return 0
  return b.unit === 'feet' ? Math.round(b.height / 9.84) : b.height
}

/**
 * The builder's selection as priced lines: equipment (markup applies, incl. the rack) and the
 * no-markup lines (installation, delivery), with the notes and compatibility checks. Pure.
 */
export function assembleBuild(sel: BuildSelection, cat: FullCatalogue): AssembledBuild {
  const lines: QuoteLineInput[] = []
  let inverter: FullCatalogue['inverters'][number] | null = null
  let battery: FullCatalogue['batteries'][number] | null = null
  let panels: { item: FullCatalogue['panels'][number]; count: number } | null = null

  for (const { sku, qty } of sel.items) {
    if (!(qty > 0)) continue
    const inv = cat.inverters.find((i) => i.sku === sku)
    const bat = cat.batteries.find((b) => b.sku === sku)
    const pnl = cat.panels.find((p) => p.sku === sku)
    const acc = cat.accessories.find((a) => a.sku === sku)
    if (inv) {
      inverter = inv
      lines.push({ sku, name: inv.name, category: 'inverter', unitCost: inv.unitCost, qty })
    } else if (bat) {
      battery = bat
      lines.push({ sku, name: bat.name, category: 'battery', unitCost: bat.unitCost, qty })
    } else if (pnl) {
      panels = { item: pnl, count: qty }
      lines.push({ sku, name: pnl.name, category: 'panels', unitCost: pnl.unitCost, qty })
    } else if (acc) {
      lines.push({ sku, name: acc.name, category: 'accessories', unitCost: acc.unitCost, qty })
    }
  }

  const rackMaterial = sel.site.rack?.wanted ? (sel.site.rack.material ?? null) : null
  const rack = panels
    ? rackLine({
        panels: panels.count,
        panelLengthCm: panels.item.lengthCm,
        material: rackMaterial,
        mounting: sel.site.mounting,
        pricePerCm: rackMaterial ? (cat.rackPrices[rackMaterial] ?? 0) : 0,
        railsPerPanel: cat.settings.railsPerPanel,
        clampPricePerPanel: cat.settings.clampPricePerPanel,
      })
    : null
  if (rack) lines.push(rack)

  const noMarkup: NoMarkupLine[] = []
  const notes: string[] = []
  const roof = cat.roofTypes.find((r) => r.id === sel.site.roofTypeId) ?? null
  if (sel.installer === 'go4solar') {
    const kva = inverter?.kva ?? sel.existing?.kva ?? 0
    const byBand = cat.installByState[sel.state] ?? cat.installByState.Other
    const base = byBand ? byBand[installBandFor(kva)] : 0
    const amount = installationCost({
      installer: 'go4solar',
      baseCost: base,
      roof: sel.site.mounting === 'roof' && roof ? { price: roof.price, unit: roof.unit } : null,
      panels: panels?.count ?? 0,
      panelKw: panels ? (panels.count * panels.item.watts) / 1000 : 0,
      storeysAbove: storeysAbove(sel.site),
      extraPerStorey: cat.settings.extraPerStorey,
    })
    if (amount > 0) noMarkup.push({ label: 'Installation', amount })
  } else {
    notes.push(OWN_INSTALLER_WARNING)
  }

  const delivery = logisticsFor(sel.state, panels?.count ?? 0, cat.logistics)
  if (delivery && !(delivery.removable && sel.ownDelivery)) {
    noMarkup.push({ label: delivery.label, amount: delivery.amount })
  } else if (delivery) {
    notes.push('Customer arranges delivery with a local vendor.')
  }

  notes.unshift(...quoteNotes(sel.site, roof ? { needsRack: roof.needsRack } : null))

  const compat = compatibility({
    inverter: inverter?.option ?? null,
    battery: battery ? { voltage: battery.voltage, kwh: battery.kwh } : null,
    panels: panels ? { panel: panels.item.option, count: panels.count } : null,
    loadKva: sel.loadKva ?? null,
    existing: sel.scope === 'some' ? (sel.existing ?? null) : null,
  })

  return {
    lines,
    noMarkup,
    installCost: noMarkup.reduce((s, l) => s + l.amount, 0),
    notes,
    compat,
  }
}
