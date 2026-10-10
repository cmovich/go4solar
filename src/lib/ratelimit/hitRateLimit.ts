import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Count one hit for `key` and say whether it is still within `limit` for the current
 * fixed window (e.g. '1 hour'). Backed by the `hit_rate_limit` SQL function, so it works
 * across serverless instances. Server only (service role).
 *
 * Fails open: if the database cannot be reached the caller is allowed through, and the
 * error is logged, so an outage never blocks the calculator.
 */
export async function hitRateLimit(key: string, limit: number, window: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('hit_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window: window,
  })
  if (error) {
    console.error('[rate-limit] hit_rate_limit failed:', error.message)
    return true
  }
  return data === true
}
