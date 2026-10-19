import 'server-only'

import { headers } from 'next/headers'

import { USER_HEADER } from './requestUser'

/** Header the audit triggers read on service-role requests (see migration 0020). */
export const ACTOR_HEADER = 'x-g4s-actor-id'

// The middleware puts the user it verified with Supabase in USER_HEADER (a browser's own copy is
// removed first), so this needs no extra trip to Supabase.
export { USER_HEADER }

async function currentActorId(): Promise<string | null> {
  try {
    return (await headers()).get(USER_HEADER)
  } catch {
    return null // outside a request
  }
}

/**
 * fetch for the service-role client: every WRITE carries the signed-in person's id, so the audit
 * triggers record who made the change even though the server, not the browser, wrote it. Reads
 * never touch the request, so pre-built (static) pages stay pre-built.
 */
export function actorFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'GET' || method === 'HEAD') return base(input, init)
    const sent = new Headers(init?.headers)
    sent.delete(ACTOR_HEADER)
    const id = await currentActorId()
    if (id) sent.set(ACTOR_HEADER, id)
    return base(input, { ...init, headers: sent })
  }
}
