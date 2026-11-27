/**
 * One-time update of old waiting-list quotes to the 4% ready-made terms (Semako, 27 Nov 2026,
 * method c). DRY RUN by default: prints every change and writes nothing.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/quote-terms-update.ts [--right-size-pack] [--json <file>]
 *   … --write   (only after Semako's yes and migration 0046)
 *
 * For each real, not-cleared entry: a calculator estimate on the old terms (same items, today's
 * prices, new terms), an own system on the old terms (same selection, today's prices and the
 * installation/delivery rule), or a ready-made plan on old terms (today's plan and terms). SPEWA
 * business quotes are left alone. The old quote is copied to waitlist_quote_versions first; one
 * audit row per person. A sizing note is added when today's sizing differs clearly.
 */
import fs from 'node:fs'

import { builderContext, priceSelection, selectionSummary } from '@/lib/build/server'
import type { BuildSelectionInput } from '@/lib/build/schema'
import { computeLoadTotals } from '@/lib/load/totals'
import type { LoadItem } from '@/lib/load/types'
import { isNgStateId } from '@/lib/nigeria/states'
import { DEFAULT_FLAT_TERMS } from '@/lib/pricing/flat'
import type { QuoteResult, TenureMonths } from '@/lib/pricing/types'
import { buildEstimate, type Estimate } from '@/lib/quotes/buildEstimate'
import { needsHomeTerms } from '@/lib/quotes/leadForPlans'
import { TERMS_UPDATE_REASON, sizingNote, updateEstimateTerms } from '@/lib/quotes/termsUpdate'
import { loadDeliveryRows, loadReadyPlan, storedReadyPlan } from '@/lib/readyPlans/server'
import { getQuoteSettings } from '@/lib/settings/getQuoteSettings'
import { gridFrom } from '@/lib/settings/schemas'
import type { Plan } from '@/lib/sizing/types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { siteAnswersSchema } from '@/lib/wizard/questions'

/** Left out for now (Semako, 27 Nov 2026): to be confirmed as a real application. */
const LEFT_OUT = [{ first: 'Irimiya', surname: 'Gadzama' }]

const write = process.argv.includes('--write')
const rightSizePack = process.argv.includes('--right-size-pack')
const jsonOut = process.argv[process.argv.indexOf('--json') + 1]

type Change = {
  id: string
  name: string
  kind: 'calculator' | 'own system' | 'ready-made plan'
  plan: string
  system: string
  oldTotal: number
  newTotal: number
  oldMonthly: number
  newMonthly: number
  months: number
  note: string | null
  missing: string[]
  version: number
  column: 'estimate' | 'builder'
  value: unknown
  old: unknown
  isTest: boolean
}

const total = (q: Pick<QuoteResult, 'deposit' | 'balance'>) => q.deposit + q.balance
const sizeText = (z: { inverterKva: number; batteryKwh: number; panelCount: number }) =>
  `${z.inverterKva} kVA · ${z.batteryKwh} kWh · ${z.panelCount} panel${z.panelCount === 1 ? '' : 's'}`

async function main() {
  const admin = createAdminClient()
  const settings = await getQuoteSettings()
  const terms = settings.homeTerms ?? DEFAULT_FLAT_TERMS
  const [{ data: comps, error: ce }, { data: leads, error: le }, ctx, rows] = await Promise.all([
    admin.from('components').select('sku, unit_cost, active'),
    admin
      .from('waitlist_consumers')
      .select('*')
      .eq('is_test', false)
      .is('cleared_at', null)
      .limit(5000),
    builderContext(),
    loadDeliveryRows(),
  ])
  if (ce || le) throw new Error(ce?.message ?? le?.message)
  const costBySku = new Map(
    (comps ?? []).filter((c) => c.active).map((c) => [c.sku.toUpperCase(), Number(c.unit_cost)]),
  )
  const changes: Change[] = []
  const skipped: { name: string; why: string }[] = []

  for (const l of leads ?? []) {
    const name = `${l.first_name ?? ''} ${l.surname ?? ''}`.trim() || '(no name)'
    const version = (l as { quote_version?: number }).quote_version ?? 1
    if (LEFT_OUT.some((x) => x.first === l.first_name && x.surname === l.surname)) {
      skipped.push({ name, why: 'left out by Semako (to confirm)' })
      continue
    }
    if (!l.state || !isNgStateId(l.state)) continue
    const e = l.estimate as unknown as
      (Estimate & { chosen?: { plan: Plan; quote: QuoteResult } }) | null

    if (e && needsHomeTerms(e)) {
      const site = siteAnswersSchema.safeParse(l.site ?? {}).data ?? {}
      const { estimate, missing } = updateEstimateTerms(e, {
        settings,
        costBySku,
        state: l.state,
        site,
        rightSizePack,
      })
      const plan: Plan = e.chosen?.plan ?? 'comfort'
      const before = e.chosen?.quote ?? e.plans[plan].quote
      const after =
        (estimate as Estimate & { chosen?: { quote: QuoteResult } }).chosen?.quote ??
        estimate.plans[plan].quote
      let note: string | null = null
      if (Array.isArray(l.load_items) && l.load_items.length > 0) {
        try {
          const today = buildEstimate(
            computeLoadTotals(l.load_items as unknown as LoadItem[], {
              nightShare: settings.sizing.nightShare,
            }),
            l.state,
            e.depositShare,
            settings,
            gridFrom(l.grid),
            site,
            l.applicant_type,
          )
          note = sizingNote(e.plans[plan].size, {
            size: today.plans[plan].size,
            total: total(today.plans[plan].quote),
          })
        } catch {
          note = sizingNote(e.plans[plan].size, 'too-large')
        }
      }
      changes.push({
        id: l.id,
        name,
        kind: 'calculator',
        plan: e.chosen ? plan : `${plan} (no plan chosen)`,
        system: sizeText(e.plans[plan].size),
        oldTotal: total(before),
        newTotal: total(after),
        oldMonthly: before.monthly,
        newMonthly: after.monthly,
        months: 12,
        note,
        missing,
        version,
        column: 'estimate',
        value: estimate,
        old: e,
        isTest: l.is_test,
      })
      continue
    }

    const b = (!e ? l.builder : null) as {
      kind: 'builder' | 'ready'
      plan?: { slug: string }
      selection?: BuildSelectionInput
      fixed?: { payment?: 'plan' | 'full' }
      quote: QuoteResult
    } | null
    if (!b) continue
    if (b.quote.snapshot.offer || l.applicant_type === 'business') {
      skipped.push({ name, why: 'SPEWA business (unchanged)' })
      continue
    }
    const months = b.quote.snapshot.tenureMonths
    if (b.kind === 'ready') {
      const p = b.plan ? await loadReadyPlan(b.plan.slug, false) : null
      if (!p) {
        skipped.push({ name, why: 'ready-made plan not found' })
        continue
      }
      const site = siteAnswersSchema.safeParse(b.selection?.site ?? {}).data ?? {}
      const next = storedReadyPlan(p, months, l.state, site, rows, b.fixed?.payment ?? 'plan')
      if (next.quote.monthly === b.quote.monthly && total(next.quote) === total(b.quote)) {
        skipped.push({ name, why: 'already on the 4% terms (no change)' })
        continue
      }
      changes.push({
        id: l.id,
        name,
        kind: 'ready-made plan',
        plan: p.name,
        system: `${p.inverterKva} kVA`,
        oldTotal: total(b.quote),
        newTotal: total(next.quote),
        oldMonthly: b.quote.monthly,
        newMonthly: next.quote.monthly,
        months,
        note: null,
        missing: [],
        version,
        column: 'builder',
        value: { ...b, ...next, selection: b.selection ?? next.selection },
        old: b,
        isTest: l.is_test,
      })
      continue
    }
    if (b.quote.snapshot.terms || !b.selection) {
      skipped.push({ name, why: 'own system already on the new terms (no change)' })
      continue
    }
    const sel = b.selection
    const { priced, quote } = priceSelection(
      ctx,
      sel,
      b.quote.snapshot.depositShare,
      months as TenureMonths,
    )
    if (!priced || !quote) {
      skipped.push({ name, why: 'own system could not be priced today' })
      continue
    }
    changes.push({
      id: l.id,
      name,
      kind: 'own system',
      plan: 'own system',
      system: priced.lines.map((x) => `${x.name} ×${x.qty}`).join(', '),
      oldTotal: total(b.quote),
      newTotal: total(quote),
      oldMonthly: b.quote.monthly,
      newMonthly: quote.monthly,
      months,
      note: null,
      missing: [],
      version,
      column: 'builder',
      value: {
        ...b,
        notes: priced.notes,
        size: selectionSummary(ctx, sel).size,
        quote,
        sample: priced.sample,
      },
      old: b,
      isTest: l.is_test,
    })
  }

  changes.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  const n = (v: number) => `₦${v.toLocaleString('en-NG')}`
  console.log(
    `${write ? 'WRITING' : 'DRY RUN (nothing written)'} · terms ${terms.monthlyRate * 100}%/month · pack ${rightSizePack ? 'right-size' : 'as quoted'}`,
  )
  for (const c of changes) {
    console.log(
      [
        c.kind,
        c.name,
        c.plan,
        c.system,
        `${n(c.oldTotal)} → ${n(c.newTotal)}`,
        `${n(c.oldMonthly)} → ${n(c.newMonthly)} ×${c.months}`,
        c.note ?? '',
        c.missing.join(' '),
      ].join(' | '),
    )
  }
  for (const s of skipped) console.log(`skipped | ${s.name} | ${s.why}`)
  console.log(
    `changes ${changes.length} · sizing notes ${changes.filter((c) => c.note).length} · skipped ${skipped.length}`,
  )
  if (jsonOut && jsonOut !== '--write') {
    fs.writeFileSync(
      jsonOut,
      JSON.stringify(
        changes.map(({ value: _v, old: _o, ...c }) => c),
        null,
        1,
      ),
    )
  }
  if (!write) return

  const now = new Date().toISOString()
  for (const c of changes) {
    const { error: ve } = await admin.from('waitlist_quote_versions').insert({
      waitlist_id: c.id,
      version: c.version,
      ...(c.column === 'estimate' ? { estimate: c.old as Json } : { builder: c.old as Json }),
      replaced_at: now,
      reason: TERMS_UPDATE_REASON,
      is_test: c.isTest,
    })
    if (ve) throw new Error(`${c.name}: could not keep the old version (${ve.message}). Stopped.`)
    const { data: done, error: ue } = await admin
      .from('waitlist_consumers')
      .update({
        ...(c.column === 'estimate' ? { estimate: c.value as Json } : { builder: c.value as Json }),
        quote_version: c.version + 1,
        sizing_note: c.note,
      })
      .eq('id', c.id)
      .eq('quote_version', c.version)
      .select('id')
    if (ue || !done?.length)
      throw new Error(`${c.name}: not updated (${ue?.message ?? 'changed meanwhile'}). Stopped.`)
    await admin.from('audit_log').insert({
      actor_id: null,
      action: 'waitlist.quote_terms_update',
      entity: 'waitlist_consumers',
      entity_id: c.id,
      before: { version: c.version, total: c.oldTotal, monthly: c.oldMonthly } as Json,
      after: {
        version: c.version + 1,
        total: c.newTotal,
        monthly: c.newMonthly,
        sizingNote: c.note,
        rightSizePack,
        reason: TERMS_UPDATE_REASON,
      } as Json,
    })
    console.log(`updated ${c.name}`)
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
