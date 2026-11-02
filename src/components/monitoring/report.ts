import { SAVED_PROGRESS_KEYS } from '@/lib/monitoring/clientError'

/** Send one crash report to /api/client-error (best effort, never throws). */
export function reportClientError(kind: 'error' | 'rejection' | 'boundary', err: unknown) {
  try {
    const e = err instanceof Error ? err : new Error(String(err))
    const body = JSON.stringify({
      kind,
      path: window.location.pathname,
      message: `${e.name}: ${e.message}`,
      digest: (e as Error & { digest?: string }).digest,
    })
    if (
      !navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))
    ) {
      void fetch('/api/client-error', { method: 'POST', body, keepalive: true }).catch(() => {})
    }
  } catch {
    // Reporting must never cause another error.
  }
}

/** "Start again": forget the builder and calculator progress saved in this browser, then reload. */
export function clearSavedProgress() {
  try {
    for (const k of SAVED_PROGRESS_KEYS) window.localStorage.removeItem(k)
  } catch {
    // Storage blocked: nothing saved to clear.
  }
  window.location.reload()
}
