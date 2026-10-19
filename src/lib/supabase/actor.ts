import 'server-only'

import { cookies } from 'next/headers'

/** Header the audit triggers read on service-role requests (see migration 0020). */
export const ACTOR_HEADER = 'x-g4s-actor-id'

// One lookup per request: the cookie store object is unique to each request.
const perRequest = new WeakMap<object, Promise<string | null>>()

/** The signed-in person behind this request, or null (cron, webhooks, visitors, no request). */
async function currentActorId(): Promise<string | null> {
  let store: Awaited<ReturnType<typeof cookies>>
  try {
    store = await cookies()
  } catch {
    return null
  }
  if (!store.getAll().some((c) => c.name.startsWith('sb-'))) return null
  let found = perRequest.get(store)
  if (!found) {
    found = (async () => {
      try {
        const { createClient } = await import('./server')
        const { data } = await (await createClient()).auth.getUser()
        return data.user?.id ?? null
      } catch {
        return null
      }
    })()
    perRequest.set(store, found)
  }
  return found
}

/**
 * fetch for the service-role client: every WRITE carries the signed-in person's id, so the audit
 * triggers record who made the change even though the server, not the browser, wrote it. Reads
 * never touch the session, so pre-built (static) pages stay pre-built.
 */
export function actorFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'GET' || method === 'HEAD') return base(input, init)
    const headers = new Headers(init?.headers)
    headers.delete(ACTOR_HEADER)
    const id = await currentActorId()
    if (id) headers.set(ACTOR_HEADER, id)
    return base(input, { ...init, headers })
  }
}
