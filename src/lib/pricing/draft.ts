import type { PriceList, QuoteSettings } from '@/lib/settings/schemas'

import type { PricingDraft } from './adminSchemas'
import type { RateByTenure } from './types'
import type { PreviewFunder } from './preview'

/**
 * Turn the admin DRAFT (unsaved form values) into the settings the engines take, so the
 * preview reflects every keystroke exactly as a new quote would. Pure.
 */
export function draftToSettings(d: PricingDraft): QuoteSettings {
  const active = d.components.filter((c) => c.active)
  const panels = active.filter((c) => c.category === 'panels')
  const panel = panels.find((p) => p.size === d.sizing.panelWatts) ?? panels[0]
  const battery = active.find((c) => c.category === 'battery')
  const inverters = active.filter((c) => c.category === 'inverter').sort((a, b) => a.size - b.size)
  const accessories = active
    .filter((c) => c.category === 'accessories')
    .sort((a, b) => a.size - b.size)
  if (!panel || !battery || inverters.length === 0 || accessories.length === 0) {
    throw new Error(
      'The price list needs at least one active panel, battery, inverter and accessories tier',
    )
  }

  const installByState = Object.fromEntries(
    (['FCT', 'Kaduna', 'Lagos', 'Other'] as const).map((state) => [
      state,
      Object.fromEntries(
        (['small', 'medium', 'large'] as const).map((band) => [
          band,
          d.installation.find((r) => r.state === state && r.sizeBand === band)?.amount ?? 0,
        ]),
      ),
    ]),
  ) as PriceList['installByState']

  // Only switched-on tenures with all three parts get a rate, exactly as saved settings would.
  const pricingRateByTenure: RateByTenure = {}
  for (const r of d.rates) {
    const { expectedFunderRate: a, spread: b, defaultBuffer: c } = r
    if (r.enabled && a !== null && b !== null && c !== null)
      pricingRateByTenure[r.tenureMonths] = a + b + c
  }
  const twelve = pricingRateByTenure[12]
  if (twelve === undefined) throw new Error('12 months must be switched on with a pricing rate')

  return {
    sizing: d.sizing,
    energy: d.energy,
    minDepositShare: d.minDepositShare,
    priceList: {
      sample:
        [panel, battery, ...inverters, ...accessories].some((c) => c.sample) ||
        d.sample.installation,
      currency: 'NGN',
      panel: { sku: panel.sku, name: panel.name, watts: panel.size, unitCost: panel.unitCost },
      batteryModule: {
        sku: battery.sku,
        name: battery.name,
        kwh: battery.size,
        unitCost: battery.unitCost,
      },
      inverters: inverters.map((i) => ({
        sku: i.sku,
        name: i.name,
        kva: i.size,
        unitCost: i.unitCost,
      })),
      accessoriesByKva: accessories.map((a) => ({ maxKva: a.size, unitCost: a.unitCost })),
      installByState,
    },
    pricing: {
      sample: d.sample.margins || d.sample.rates,
      marginByCategory: { ...d.margins },
      pricingRateByTenure: { ...pricingRateByTenure, 12: twelve },
      pricingRateAnnual: twelve,
    },
  }
}

export function draftFunders(d: PricingDraft): PreviewFunder[] {
  return d.funders.map((f) => ({
    id: f.id,
    name: f.name,
    annualRate: f.annualRate,
    maxTenure: f.maxTenure,
    status: f.status,
  }))
}
