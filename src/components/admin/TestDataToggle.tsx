import Link from 'next/link'

/**
 * Staff reports leave out test data (is_test) unless this is on. Keeps the page's other filters.
 * Server component: a plain link, so it works without JavaScript.
 */
export async function TestDataToggle({
  path,
  params,
  on,
}: {
  path: string
  params: Record<string, string | string[] | undefined>
  on: boolean
}) {
  // Test switches never work in production, and on previews only after /test-mode unlock.
  const { testSwitchesOn } = await import('@/lib/testmode/server')
  if (!(await testSwitchesOn())) return null
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (k === 'test' || v === undefined) continue
    for (const one of Array.isArray(v) ? v : [v]) next.append(k, one)
  }
  if (!on) next.set('test', '1')
  const qs = next.toString()
  return (
    <Link
      href={qs ? `${path}?${qs}` : path}
      data-testid="test-data-toggle"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        on ? 'border-amber-400 bg-amber-100 text-amber-900' : 'text-muted-foreground bg-white'
      }`}
      aria-pressed={on}
    >
      <span
        className={`inline-block size-2 rounded-full ${on ? 'bg-amber-500' : 'bg-slate-300'}`}
        aria-hidden
      />
      {on ? 'Showing test data' : 'Show test data'}
    </Link>
  )
}

/** ?test=1 turns test data on. */
export const showTestFrom = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) === '1'
