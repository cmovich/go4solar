import 'server-only'

import { autoPickAccessories, type CatalogueItem } from '@/lib/catalogue/autopick'
import { assembleBuild, type FullCatalogue } from '@/lib/catalogue/build'
import { logisticsFor } from '@/lib/catalogue/extras'
import { loadCatalogue, toBuilderItems, type BuilderItem } from '@/lib/catalogue/server'
import { makeItem } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'
import { priceQuote } from '@/lib/pricing/price'
import { offeredTenures } from '@/lib/pricing/tenures'
import type { QuoteResult, TenureMonths } from '@/lib/pricing/types'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'
import { DEFAULT_SUN_HOURS, type QuoteSettings } from '@/lib/settings/schemas'
import { sizeSystem } from '@/lib/sizing/size'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_WIRING, wireEstimate } from '@/lib/wizard/questions'

import type { BuildSelectionInput } from './schema'

export type BuilderContext = {
  settings: QuoteSettings
  catalogue:
    | (FullCatalogue & {
        details: Map<
          string,
          { brand: string | null; description: string | null; photoUrl: string | null }
        >
      })
    | null
}

export async function builderContext(): Promise<BuilderContext> {
  const settings = await getQuoteSettings()
  const catalogue = await loadCatalogue(createAdminClient(), settings.priceList.installByState)
  return { settings, catalogue }
}

/** The builder page's items (customer prices only), or [] before migration 0027. */
export function builderItems(ctx: BuilderContext): BuilderItem[] {
  return ctx.catalogue
    ? toBuilderItems(ctx.catalogue, ctx.settings.pricing, ctx.settings.minDepositShare)
    : []
}

export type PricedBuild = {
  lines: { sku: string; name: string; qty: number; lineTotal: number }[]
  noMarkup: { label: string; amount: number }[]
  systemPrice: number
  deposit: number
  monthly: number
  months: number
  notes: string[]
  blocking: string[]
  warnings: string[]
  tenures: TenureMonths[]
  sample: boolean
  /** Local vendors in this state: the customer may arrange delivery themselves. */
  deliveryRemovable: boolean
}

/**
 * Price a builder selection with the same engine as every quote (markup on equipment only;
 * installation and delivery never marked up). Returns customer figures only.
 */
export function priceSelection(
  ctx: BuilderContext,
  sel: BuildSelectionInput,
  depositShare: number,
  tenure: TenureMonths,
): { priced: PricedBuild | null; quote: QuoteResult | null } {
  if (!ctx.catalogue) return { priced: null, quote: null }
  const built = assembleBuild(sel, ctx.catalogue)
  const tenures = offeredTenures(ctx.settings.pricing.pricingRateByTenure)
  const empty: PricedBuild = {
    lines: [],
    noMarkup: built.noMarkup,
    systemPrice: 0,
    deposit: 0,
    monthly: 0,
    months: tenure,
    notes: built.notes,
    blocking: built.compat.blocking,
    warnings: built.compat.warnings,
    tenures,
    sample: ctx.settings.priceList.sample || ctx.settings.pricing.sample,
    deliveryRemovable: logisticsFor(sel.state, 0, ctx.catalogue.logistics)?.removable ?? false,
  }
  if (built.lines.length === 0) return { priced: empty, quote: null }
  const rate =
    ctx.settings.pricing.pricingRateByTenure[tenure] ?? ctx.settings.pricing.pricingRateByTenure[12]
  const quote = priceQuote({
    lines: built.lines,
    installCost: built.installCost,
    noMarkup: built.noMarkup,
    marginByCategory: ctx.settings.pricing.marginByCategory,
    pricingRateAnnual: rate,
    tenureMonths: ctx.settings.pricing.pricingRateByTenure[tenure] ? tenure : 12,
    depositShare,
    minDepositShare: ctx.settings.minDepositShare,
  })
  return {
    quote,
    priced: {
      ...empty,
      lines: quote.lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        lineTotal: l.lineTotal,
      })),
      noMarkup: quote.noMarkup,
      systemPrice: quote.systemPrice,
      deposit: quote.deposit,
      monthly: quote.monthly,
      months: quote.snapshot.tenureMonths,
    },
  }
}

/** Accessories for the chosen inverter and panels (the auto-pick rules), as builder items. */
export function suggestAccessories(
  ctx: BuilderContext,
  sel: BuildSelectionInput,
): { sku: string; qty: number }[] {
  const cat = ctx.catalogue
  if (!cat) return []
  const inv = cat.inverters.find((i) => sel.items.some((s) => s.sku === i.sku))
  const kva = inv?.kva ?? sel.existing?.kva ?? sel.loadKva ?? 0
  const panelSel = sel.items.find((s) => cat.panels.some((p) => p.sku === s.sku))
  const panel = cat.panels.find((p) => p.sku === panelSel?.sku) ?? cat.panels[0]
  const itemised = cat.accessories.filter((a) => a.kind !== 'pack') as CatalogueItem[]
  if (itemised.length === 0) {
    // No itemised accessories switched on yet: the pack for this size.
    const packs = cat.accessories
      .filter((a) => a.kind === 'pack')
      .sort((a, b) => a.rating - b.rating)
    const pack = packs.find((p) => p.rating >= kva) ?? packs[packs.length - 1]
    return pack ? [{ sku: pack.sku, qty: 1 }] : []
  }
  const wire = sel.site.wire?.known
    ? { dcMetres: sel.site.wire.dcMetres ?? 20, acMetres: sel.site.wire.acMetres ?? 10 }
    : wireEstimate({ ...sel.site, wire: undefined }, ctx.settings.wiring ?? DEFAULT_WIRING)!
  const count = panelSel?.qty ?? 0
  return autoPickAccessories(
    {
      inverterKva: kva,
      dcRunM: wire.dcMetres / 2,
      dcWireM: wire.dcMetres,
      acRunM: wire.acMetres,
      stringCurrentA: panel ? panel.watts / panel.option.vmp : 10,
      stringVoltageV: panel ? panel.option.vmp * Math.max(1, Math.min(count, 4)) : 100,
      maxDrop: cat.settings.maxDcVoltageDrop,
    },
    cat.rules ?? [],
    itemised,
  ).map((p) => ({ sku: p.sku, qty: p.qty }))
}

/**
 * "I know my load (kVA)": an inverter, battery and panels sized like a Comfort plan for that
 * running load (8 h of night backup, used 6 h by day), then the accessories. The customer can
 * change anything afterwards.
 */
export function suggestForLoad(
  ctx: BuilderContext,
  kva: number,
  sel: BuildSelectionInput,
): { sku: string; qty: number }[] {
  const cat = ctx.catalogue
  if (!cat || cat.inverters.length === 0 || cat.panels.length === 0) return []
  const runningW = Math.round(kva * 1000 * ctx.settings.sizing.powerFactor)
  const totals = computeLoadTotals([
    makeItem({ id: 'load', watts: runningW, dayHours: 6, nightHours: 6, hoursPerDay: 12 }),
  ])
  const panel = cat.panels[0]!
  let size
  try {
    size = sizeSystem(totals, 'comfort', ctx.settings.sizing, {
      sun: ctx.settings.sunHours?.[sel.state] ?? DEFAULT_SUN_HOURS,
      grid: null,
      equipment: {
        inverters: cat.inverters.map((i) => i.option),
        panel: panel.option,
        batteries: cat.batteries
          .filter((b) => b.voltage !== null)
          .map((b) => ({
            sku: b.sku,
            kwh: b.kwh,
            voltage: b.voltage!,
            usableDod: null,
            unitCost: b.unitCost,
          })),
      },
    })
  } catch {
    return fallbackForLoad(ctx, kva, sel)
  }
  const items: { sku: string; qty: number }[] = []
  if (size.inverterSku) items.push({ sku: size.inverterSku, qty: 1 })
  const battery =
    (size.battery?.sku && cat.batteries.find((b) => b.sku === size.battery!.sku)) ??
    cat.batteries.find((b) => b.voltage === size.batteryV) ??
    cat.batteries[0]
  if (battery) {
    items.push({
      sku: battery.sku,
      qty: size.battery?.sku
        ? size.battery.modules
        : Math.max(1, Math.ceil(size.batteryKwh / battery.kwh)),
    })
  }
  items.push({ sku: panel.sku, qty: size.panelCount })
  return [...items, ...suggestAccessories(ctx, { ...sel, items, loadKva: kva })]
}

/**
 * When a load needs more solar than any inverter connects: the smallest inverter for the load,
 * 8 h of battery at its voltage and as many panels as it takes. The customer adjusts from there.
 */
function fallbackForLoad(
  ctx: BuilderContext,
  kva: number,
  sel: BuildSelectionInput,
): { sku: string; qty: number }[] {
  const cat = ctx.catalogue!
  const inv =
    [...cat.inverters].sort((a, b) => a.kva - b.kva).find((i) => i.kva >= kva) ??
    [...cat.inverters].sort((a, b) => b.kva - a.kva)[0]!
  const panel = cat.panels[0]!
  const usable = ctx.settings.sizing.dod * ctx.settings.sizing.inverterEfficiency
  const needKwh = (kva * ctx.settings.sizing.powerFactor * 8) / usable
  const battery = cat.batteries.find((b) => b.voltage === inv.option.batteryV) ?? cat.batteries[0]
  const items: { sku: string; qty: number }[] = [{ sku: inv.sku, qty: 1 }]
  if (battery) items.push({ sku: battery.sku, qty: Math.max(1, Math.ceil(needKwh / battery.kwh)) })
  items.push({ sku: panel.sku, qty: Math.max(1, Math.floor(inv.option.maxPvW / panel.watts)) })
  return [...items, ...suggestAccessories(ctx, { ...sel, items, loadKva: kva })]
}
