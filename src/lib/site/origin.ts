type Env = Record<string, string | undefined>

/**
 * The address of the site the app is running on, for links in messages. Production uses
 * NEXT_PUBLIC_SITE_URL (else Vercel's production domain); previews and local runs always use
 * the request's own address, so a preview never sends links to the live site.
 */
export function originFor(headers: Headers, env: Env = process.env): string {
  if (env.VERCEL_ENV === 'production') {
    const configured = env.NEXT_PUBLIC_SITE_URL || env.VERCEL_PROJECT_PRODUCTION_URL
    if (configured) {
      const url = configured.startsWith('http') ? configured : `https://${configured}`
      return url.replace(/\/$/, '')
    }
  }
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3000'
  const proto =
    headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
