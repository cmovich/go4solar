/**
 * One-time copy of the settings and price tables from LIVE into the STAGING database
 * (docs/STAGING.md). Never copies customer, staff or money records. Reads live, writes staging.
 *
 *   STAGING_SUPABASE_URL=https://<staging>.supabase.co \
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY=<staging service role key> \
 *   npx tsx --env-file=.env.local scripts/staging-copy-config.ts          # counts only
 *   … scripts/staging-copy-config.ts --write                              # copies
 */
import { createClient } from '@supabase/supabase-js'

import {
  CONFIG_TABLES,
  MEDIA_FOLDERS,
  PRIMARY_KEY,
  cleanRow,
  rewriteHost,
  targetProblem,
} from '../src/lib/staging/copy'

async function main() {
  const write = process.argv.includes('--write')
  const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const targetUrl = process.env.STAGING_SUPABASE_URL ?? ''
  const problem = targetProblem(sourceUrl, targetUrl)
  if (problem) throw new Error(problem)
  const source = createClient(sourceUrl, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })
  const rows: Record<string, Record<string, unknown>[]> = {}
  for (const t of CONFIG_TABLES) {
    const { data, error } = await source.from(t).select('*').limit(5000)
    if (error) throw new Error(`${t}: ${error.message}`)
    rows[t] = (data ?? []).map((r) =>
      rewriteHost(cleanRow(t, r as Record<string, unknown>), sourceUrl, targetUrl),
    )
    console.log(`${t}: ${rows[t]!.length} rows`)
  }
  if (!write) return console.log('Counts only. Run again with --write to copy into staging.')
  const target = createClient(targetUrl, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })

  // Pictures first (plans, roofs, partner logos), so the copied links work.
  for (const folder of MEDIA_FOLDERS) {
    const { data: files } = await source.storage.from('site-media').list(folder, { limit: 1000 })
    for (const f of files ?? []) {
      const path = `${folder}/${f.name}`
      const { data: blob, error } = await source.storage.from('site-media').download(path)
      if (error || !blob) throw new Error(`reading ${path}: ${error?.message}`)
      const up = await target.storage
        .from('site-media')
        .upload(path, blob, { upsert: true, contentType: blob.type || undefined })
      if (up.error) throw new Error(`copying ${path}: ${up.error.message}`)
    }
    console.log(`copied pictures: ${folder} (${(files ?? []).length})`)
  }

  // Staging's own sample rows (from the migrations) go first, last table first.
  for (const t of [...CONFIG_TABLES].reverse()) {
    const { error } = await target.from(t).delete().not(PRIMARY_KEY[t], 'is', null)
    if (error) throw new Error(`clearing ${t} in staging: ${error.message}`)
  }
  for (const t of CONFIG_TABLES) {
    const list = rows[t]!
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await target.from(t).insert(list.slice(i, i + 500))
      if (error) throw new Error(`copying ${t}: ${error.message}`)
    }
    console.log(`copied ${t}`)
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
