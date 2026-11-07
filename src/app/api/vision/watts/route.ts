import { NextResponse } from 'next/server'

import { getVisionProvider, type PhotoKind } from '@/lib/providers/vision'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'
import { lookupCostNaira } from '@/lib/vision/spend'
import { photoLookupOpen, recordLookup } from '@/lib/vision/server'

export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const LOOKUPS_PER_HOUR = 10

/**
 * POST multipart/form-data: `image` (jpeg/png/webp, ≤ 5 MB) and `kind` ("label" for a photo of
 * the rating label, "item" for a photo of the appliance). The photo is processed in memory and
 * never stored. Checks the per-visitor daily limit and the daily spend cap first; records the
 * lookup's cost after.
 */
export async function POST(req: Request) {
  const { open, settings } = await photoLookupOpen()
  if (!open) {
    return NextResponse.json(
      { error: 'The photo lookup is resting for today. Please type the watts instead.' },
      { status: 404 },
    )
  }
  const form = await req.formData().catch(() => null)
  const file = form?.get('image')
  const kind: PhotoKind = form?.get('kind') === 'item' ? 'item' : 'label'
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Send the photo as the "image" field.' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Use a JPEG, PNG or WebP photo.' }, { status: 415 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'The photo is empty.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'The photo must be under 5 MB.' }, { status: 413 })
  }

  const ip = clientIp(req.headers)
  const [hour, day] = await Promise.all([
    hitRateLimit(`vision:${ip}`, LOOKUPS_PER_HOUR, '1 hour'),
    hitRateLimit(`vision-day:${ip}`, settings.perVisitorPerDay, '1 day'),
  ])
  if (!hour || !day) {
    return NextResponse.json(
      { error: 'You have used the photo lookup a lot today. Please type the watts instead.' },
      { status: 429, headers: { 'retry-after': hour ? '86400' : '3600' } },
    )
  }

  try {
    const provider = await getVisionProvider()
    const { result, usage } = await provider.lookup(file, kind)
    await recordLookup(lookupCostNaira(usage, settings))
    return NextResponse.json(result)
  } catch (err) {
    console.error('[vision]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Could not read the photo. Try again with a clearer picture.' },
      { status: 502 },
    )
  }
}
