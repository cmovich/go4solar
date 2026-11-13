/**
 * Ready-made plan pictures from the photos in plan-images/ (never committed; see .gitignore).
 * Each photo becomes a 4:3 WebP, at most 800 px wide and never enlarged, stored in the public
 * site-media bucket (where the other site pictures live) under plan/<slug>-<hash>.webp, and
 * set as that plan's picture. Every change writes an audit row. Which photo goes with which
 * plan: scripts/plan-photos.json. Later replacements: Admin → Pricing → Ready-made plans.
 *
 * Run on your own machine (uses the service role key in .env.local): npm run plans:images
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import sharp from 'sharp'

import { planImagePath, planImageSize } from '../src/lib/readyPlans/image'

config({ path: '.env.local' })

const ROOT = process.cwd()
const PHOTOS = path.join(ROOT, 'plan-images')
const MAP = JSON.parse(readFileSync(path.join(ROOT, 'scripts/plan-photos.json'), 'utf8')) as Record<
  string,
  string
>

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  const db = createClient(url, key, { auth: { persistSession: false } })

  for (const [slug, file] of Object.entries(MAP)) {
    const source = path.join(PHOTOS, file)
    if (!existsSync(source)) throw new Error(`Missing photo: plan-images/${file}`)
    const meta = await sharp(source).rotate().metadata()
    const size = planImageSize(meta.width!, meta.height!)
    const webp = await sharp(source)
      .rotate()
      .resize({ ...size, fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer()
    const hash = createHash('sha256').update(webp).digest('hex')
    const target = planImagePath(slug, hash)

    const { data: plan, error: readError } = await db
      .from('ready_plans')
      .select('id, image')
      .eq('slug', slug)
      .maybeSingle()
    if (readError || !plan) throw new Error(`Plan not found: ${slug}`)
    if (plan.image === target) {
      console.log(`${slug}: already up to date (${target})`)
      continue
    }
    const { error: upError } = await db.storage
      .from('site-media')
      .upload(target, webp, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
    if (upError) throw new Error(`${slug}: upload failed: ${upError.message}`)
    const { error: setError } = await db
      .from('ready_plans')
      .update({ image: target, updated_at: new Date().toISOString() })
      .eq('id', plan.id)
    if (setError) throw new Error(`${slug}: could not set the picture: ${setError.message}`)
    await db.from('audit_log').insert({
      actor_id: null,
      action: 'ready_plan.image',
      entity: 'ready_plans',
      entity_id: plan.id,
      before: { image: plan.image },
      after: { image: target, source: file, script: 'plans:images' },
    })
    console.log(
      `${slug}: ${file} → ${target} (${size.width} × ${size.height}, ${Math.round(webp.length / 1024)} KB)`,
    )
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
