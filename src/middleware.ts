import { NextResponse, type NextRequest } from 'next/server'

import { launchMode } from '@/config/site'
import { prelaunchBlock } from '@/lib/launch/guard'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Prelaunch: live-only routes are closed (see src/lib/launch/guard.ts).
  const block = prelaunchBlock(request.nextUrl.pathname, launchMode())
  if (block) {
    if ('notFound' in block) return new NextResponse('Not found', { status: 404 })
    return NextResponse.redirect(new URL(block.redirect, request.url))
  }
  return updateSession(request)
}

export const config = {
  // Everything except static files and images.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
