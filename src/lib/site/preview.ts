/**
 * Preview deployments share the live database (Semako, 26 Nov 2026: a batch was exported to
 * Trade Lenda from a preview by mistake), so every admin page on a preview says so.
 */
export const PREVIEW_BANNER =
  'PREVIEW — this uses the LIVE database. Exports, ticks and edits are real.'

export function isPreviewDeployment(env: { VERCEL_ENV?: string }): boolean {
  return env.VERCEL_ENV === 'preview'
}
