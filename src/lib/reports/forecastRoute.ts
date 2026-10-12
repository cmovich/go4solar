import 'server-only'

import { NextResponse } from 'next/server'

import { getSessionInfo } from '@/lib/auth/session'

import { getScenario } from './forecast'

/** Super admin / finance with two-factor; the saved scenario, or an error response. */
export async function scenarioForExport(id: string) {
  const s = await getSessionInfo()
  if (!s.user || s.aal !== 'aal2' || !['super_admin', 'finance'].includes(s.role ?? '')) {
    return { error: NextResponse.json({ error: 'not allowed' }, { status: 403 }) }
  }
  const scenario = await getScenario(id)
  if (!scenario) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) }
  return { scenario }
}

export const fileName = (name: string, ext: string) =>
  `go4solar-forecast-${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'scenario'
  }.${ext}`
