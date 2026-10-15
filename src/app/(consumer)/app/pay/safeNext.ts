/** Only send people back to this site (no open redirects through the mock pages). */
export function safeNext(next: string | undefined, origin: string, fallback: string): string {
  if (!next) return fallback
  try {
    const url = new URL(next, origin)
    return url.origin === origin ? url.pathname + url.search : fallback
  } catch {
    return fallback
  }
}
