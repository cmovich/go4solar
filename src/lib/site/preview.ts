import { LIVE_SUPABASE_REF, supabaseRef } from '@/lib/staging/copy'

/**
 * A batch was exported to Trade Lenda from a preview by mistake (Semako, 26 Nov 2026), so every
 * admin page on a preview says which database it uses: red while previews share the live
 * database (or the database is unknown), a calm note once they use staging (docs/STAGING.md).
 */
export const PREVIEW_BANNER =
  'PREVIEW — this uses the LIVE database. Exports, ticks and edits are real.'

export const STAGING_BANNER =
  'PREVIEW — staging database (test data only). Nothing here reaches customers or funders.'

export function isPreviewDeployment(env: { VERCEL_ENV?: string }): boolean {
  return env.VERCEL_ENV === 'preview'
}

export function previewBanner(env: {
  VERCEL_ENV?: string
  NEXT_PUBLIC_SUPABASE_URL?: string
}): { tone: 'live' | 'staging'; text: string } | null {
  if (!isPreviewDeployment(env)) return null
  const ref = supabaseRef(env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  return !ref || ref === LIVE_SUPABASE_REF
    ? { tone: 'live', text: PREVIEW_BANNER }
    : { tone: 'staging', text: STAGING_BANNER }
}
