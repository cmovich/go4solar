import { NextResponse } from 'next/server'

import { getVisionProvider } from '@/lib/providers/vision'
import { clientIp } from '@/lib/ratelimit/clientIp'
import { hitRateLimit } from '@/lib/ratelimit/hitRateLimit'

export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const LOOKUPS_PER_HOUR = 10

/**
 * POST multipart/form-data with field `image` (jpeg/png/webp, ≤ 5 MB).
 * Returns the vision provider's reading. The image is processed in memory and never stored.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const file = form?.get('image')
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

  const allowed = await hitRateLimit(`vision:${clientIp(req.headers)}`, LOOKUPS_PER_HOUR, '1 hour')
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many lookups from your connection. Try again in an hour.' },
      { status: 429, headers: { 'retry-after': '3600' } },
    )
  }

  try {
    const provider = await getVisionProvider()
    const result = await provider.estimateWatts(file)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[vision]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Could not read the photo. Try again with a clearer picture.' },
      { status: 502 },
    )
  }
}
