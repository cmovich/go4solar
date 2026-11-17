/**
 * Load SPEWA's price list into Admin → Pricing → SPEWA price list (run on your own machine only:
 * it uses the service role key in .env.local; the CSV and its prices never go into git).
 *   npm run spewa:load -- spewa/spewa-price-list-2026-11-09.csv
 * Adds items whose code is new; items already in the list (same code) are left as they are, so
 * running it twice changes nothing and admin edits are never overwritten. Items with no price
 * are loaded switched off. One audit_log row (spewa_items.load) lists the codes added.
 *   --dry   only prints what would be added.
 */
import { readFileSync } from 'node:fs'

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

import { parseSpewaCsv } from '../src/lib/spewa/priceList'
import type { Database } from '../src/lib/supabase/database.types'

config({ path: '.env.local' })

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const dry = process.argv.includes('--dry')
  if (!file) throw new Error('Usage: npm run spewa:load -- <file.csv> [--dry]')
  const rows = parseSpewaCsv(readFileSync(file, 'utf8'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
  const db = createClient<Database>(url, key, { auth: { persistSession: false } })

  const { data: existing, error } = await db.from('spewa_price_items').select('code')
  if (error)
    throw new Error(`Cannot read the price list (is migration 0039 applied?): ${error.message}`)
  const known = new Set((existing ?? []).map((r) => r.code))
  const fresh = rows.filter((r) => !known.has(r.code))
  console.log(
    `${rows.length} items in the file, ${fresh.length} new, ${rows.length - fresh.length} already in the list.`,
  )
  console.log(
    `Switched off (no price): ${
      fresh
        .filter((r) => !r.active)
        .map((r) => r.itemNo)
        .join(', ') || 'none'
    }`,
  )
  if (dry || fresh.length === 0) return

  const insert = fresh.map((r) => ({
    item_no: r.itemNo,
    category: r.category,
    code: r.code,
    product: r.product,
    brand: r.brand,
    warranty: r.warranty,
    ...r.prices,
    kind: r.kind,
    rating_kw: r.ratingKw,
    voltage: r.voltage,
    high_voltage: r.highVoltage,
    kwh: r.kwh,
    watts: r.watts,
    active: r.active,
    sort_order: r.sortOrder,
  }))
  const { error: insError } = await db.from('spewa_price_items').insert(insert)
  if (insError) throw new Error(`Could not load the items: ${insError.message}`)
  await db.from('audit_log').insert({
    actor_id: null,
    action: 'spewa_items.load',
    entity: 'spewa_price_items',
    entity_id: null,
    before: null,
    after: { file: file.split('/').pop() ?? file, added: fresh.map((r) => r.code) },
  })
  console.log(`Loaded ${fresh.length} items.`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
