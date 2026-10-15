import type { PriceList, QuoteSettings } from '@/lib/settings/schemas'

import type { PricingDraft } from './adminSchemas'
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

  const rate = (t: 3 | 6 | 9 | 12) => {
    const r = d.rates.find((x) => x.tenureMonths === t)
    return r ? r.expectedFunderRate + r.spread + r.defaultBuffer : 0
  }
  const pricingRateByTenure = { 3: rate(3), 6: rate(6), 9: rate(9), 12: rate(12) }

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
      pricingRateByTenure,
      pricingRateAnnual: pricingRateByTenure[12],
    },
  }
}

export function draftFunders(d: PricingDraft): PreviewFunder[] {
  return d.funders.map((f) => ({
    id: f.id,
    name: f.name,
    annualRate: f.annualRate,
    status: f.status,
  }))
}
