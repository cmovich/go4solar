import type { QuoteLineInput } from '@/lib/pricing/types'

/** Part F: racks, delivery and installation extras. Pure. */

export type RackMaterial = 'metal' | 'aluminium'

/**
 * The roof rack as one equipment line (markup applies, like any equipment):
 * panels × panel length (cm) × price per cm × rails per panel + clamps per panel.
 * None on ground/car-park mounting, when declined, or when the panel length is unknown.
 */
export function rackLine(i: {
  panels: number
  panelLengthCm: number | null
  material: RackMaterial | null
  mounting: string | undefined
  pricePerCm: number
  railsPerPanel: number
  clampPricePerPanel: number
}): QuoteLineInput | null {
  if (!i.material || (i.mounting && i.mounting !== 'roof') || !i.panelLengthCm || i.panels <= 0) {
    return null
  }
  const cost =
    i.panels * i.panelLengthCm * i.pricePerCm * i.railsPerPanel + i.panels * i.clampPricePerPanel
  const label = i.material === 'aluminium' ? 'Aluminium' : 'Metal'
  return {
    sku: `RACK-${i.material.toUpperCase()}`,
    name: `${label} roof rack — ${i.panels} panels × ${i.panelLengthCm} cm`,
    category: 'accessories',
    unitCost: Math.round(cost),
    qty: 1,
  }
}

export type LogisticsRow = {
  state: string
  amount: number
  extraPerPanel: number
  localVendorsAvailable: boolean
}

/**
 * "Delivery — Go4Solar logistics (State)": the state's price (else "Other") plus any amount per
 * panel. Never marked up. Removable only in states with local vendors.
 */
export function logisticsFor(
  state: string,
  panels: number,
  rows: LogisticsRow[],
): { label: string; amount: number; removable: boolean } | null {
  const row = rows.find((r) => r.state === state) ?? rows.find((r) => r.state === 'Other')
  if (!row) return null
  return {
    label: `Delivery — Go4Solar logistics (${state === 'FCT' ? 'Abuja (FCT)' : state})`,
    amount: Math.round(row.amount + row.extraPerPanel * panels),
    removable: row.localVendorsAvailable,
  }
}

export const OWN_INSTALLER_WARNING =
  'Go4Solar is not liable for any installation errors brought to us.'

/**
 * Installation (never marked up): with a Go4Solar installer, the state's base price for the size
 * band + the roof type's price (per panel or per kW) + an amount per storey above the ground.
 * With the customer's own installer, nothing.
 */
export function installationCost(i: {
  installer: 'go4solar' | 'own'
  baseCost: number
  roof: { price: number; unit: 'per_panel' | 'per_kw' } | null
  panels: number
  panelKw: number
  storeysAbove: number
  extraPerStorey: number
}): number {
  if (i.installer === 'own') return 0
  const roof = i.roof
    ? i.roof.unit === 'per_kw'
      ? i.roof.price * i.panelKw
      : i.roof.price * i.panels
    : 0
  return Math.round(i.baseCost + roof + Math.max(0, i.storeysAbove) * i.extraPerStorey)
}
