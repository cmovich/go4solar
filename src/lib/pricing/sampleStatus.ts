import { stateLabel } from '@/lib/nigeria/states'

/**
 * Which pricing rows are still SAMPLE (placeholder) values. The website hides every naira amount
 * while any row that feeds a customer price is SAMPLE: active components, margins, switched-on
 * tenure rates and installation prices (the same rule as `pricingFromRows`/`priceListFromRows`).
 * Unit costs and energy prices only feed admin figures and advice, so they are listed but do not
 * hide prices. Switched-off tenures and inactive components never count. Pure.
 */
export type SampleSection =
  'components' | 'margins' | 'rates' | 'installation' | 'unit-costs' | 'energy'

export type SampleItem = {
  section: SampleSection
  key: string
  label: string
  hidesPrices: boolean
}

export type SampleInput = {
  components: { id: string; sku: string; name: string; active: boolean; sample: boolean }[]
  margins: { category: string; sample: boolean }[]
  rates: { tenureMonths: number; enabled: boolean; sample: boolean }[]
  installation: { state: string; sizeBand: string; sample: boolean }[]
  unitCostsSample: boolean
  energySample: boolean
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function sampleItems(i: SampleInput): SampleItem[] {
  return [
    ...i.components
      .filter((c) => c.active && c.sample)
      .map((c) => ({
        section: 'components' as const,
        key: c.id,
        label: `${c.sku} · ${c.name}`,
        hidesPrices: true,
      })),
    ...i.margins
      .filter((m) => m.sample)
      .map((m) => ({
        section: 'margins' as const,
        key: m.category,
        label: `${cap(m.category)} margin`,
        hidesPrices: true,
      })),
    ...i.rates
      .filter((r) => r.enabled && r.sample)
      .map((r) => ({
        section: 'rates' as const,
        key: String(r.tenureMonths),
        label: `${r.tenureMonths} months rate`,
        hidesPrices: true,
      })),
    ...i.installation
      .filter((r) => r.sample)
      .map((r) => ({
        section: 'installation' as const,
        key: `${r.state}:${r.sizeBand}`,
        label: `${r.state === 'Other' ? 'Other (fallback)' : stateLabel(r.state)} · ${r.sizeBand}`,
        hidesPrices: true,
      })),
    ...(i.unitCostsSample
      ? [
          {
            section: 'unit-costs' as const,
            key: 'unit_costs',
            label: 'Unit costs',
            hidesPrices: false,
          },
        ]
      : []),
    ...(i.energySample
      ? [
          {
            section: 'energy' as const,
            key: 'energy',
            label: 'Energy prices and factors',
            hidesPrices: false,
          },
        ]
      : []),
  ]
}

export function sampleSummary(items: SampleItem[]): {
  hiding: number
  other: number
  message: string
} {
  const hiding = items.filter((i) => i.hidesPrices).length
  const other = items.length - hiding
  const message =
    hiding === 0
      ? 'All prices confirmed — prices are showing on the website.'
      : hiding === 1
        ? '1 item still marked SAMPLE — prices are hidden on the website until it is confirmed or changed'
        : `${hiding} items still marked SAMPLE — prices are hidden on the website until these are confirmed or changed`
  return { hiding, other, message }
}
