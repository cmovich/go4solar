import { NextResponse } from 'next/server'

import { photoLookupOpen } from '@/lib/vision/server'

export const dynamic = 'force-dynamic'

/** Whether the calculator shows the photo button now (key set and today's cap not reached). */
export async function GET() {
  const { open } = await photoLookupOpen()
  return NextResponse.json({ open }, { headers: { 'cache-control': 'no-store' } })
}
