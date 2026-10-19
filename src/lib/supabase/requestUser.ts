/**
 * The middleware verifies the signed-in user with Supabase on every request and forwards their
 * id to the server in this request header. Any copy a browser sends is removed first, so server
 * code can trust it. (No imports: used by the middleware.)
 */
export const USER_HEADER = 'x-g4s-user-id'

export function withVerifiedUser(incoming: Headers, userId: string | null): Headers {
  const out = new Headers(incoming)
  out.delete(USER_HEADER)
  if (userId) out.set(USER_HEADER, userId)
  return out
}
