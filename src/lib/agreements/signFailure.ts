/** Shown when the signed agreement could not be finished (PDF, storage or database step). */
export const SIGN_FAILED =
  'We could not finish signing, so nothing was signed. Please ask for a new code and try again. If it happens again, contact us.'

/** Logs why finishing an agreement failed: the error message only, never personal details. */
export function logSignFailure(type: 'consumer' | 'guarantor', err: unknown): void {
  console.error(
    `[agreements] could not finish the ${type} agreement:`,
    err instanceof Error ? err.message : 'unknown error',
  )
}
