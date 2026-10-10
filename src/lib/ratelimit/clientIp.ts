/** Best-effort client IP behind Vercel's proxy: first x-forwarded-for entry, then x-real-ip. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for') ?? ''
  const first = forwarded
    .split(',')
    .map((s) => s.trim())
    .find((s) => s.length > 0)
  return first ?? headers.get('x-real-ip')?.trim() ?? 'unknown'
}
