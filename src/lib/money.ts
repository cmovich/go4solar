/**
 * Money, number and phone helpers shared by every engine and screen.
 * Pure functions only: no React, Next or Supabase imports.
 */

const NAIRA = '₦' // U+20A6
const MINUS = '−' // U+2212, a proper minus sign (not a hyphen)

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** Round to the nearest whole naira. */
export function roundNaira(amount: number): number {
  return Math.round(amount)
}

/** Round to the nearest multiple of `step` (e.g. nearest ₦100). */
export function roundToStep(amount: number, step: number): number {
  if (!(step > 0)) throw new RangeError(`roundToStep: step must be positive, got ${step}`)
  return Math.round(amount / step) * step
}

/** `2475248` → `₦2,475,248`; `-39603` → `−₦39,603`. Whole naira only, no kobo. */
export function formatNaira(amount: number): string {
  const whole = roundNaira(amount)
  const digits = wholeNumber.format(Math.abs(whole))
  return whole < 0 ? `${MINUS}${NAIRA}${digits}` : `${NAIRA}${digits}`
}

/** `0.42203` with 1 decimal → `42.2%`. Shares are stored as decimals (0.2 = 20%). */
export function formatPercent(share: number, decimals = 0): string {
  return `${(share * 100).toFixed(decimals)}%`
}

export class InvalidPhoneError extends Error {
  constructor(input: string) {
    super(`Not a valid Nigerian mobile number: "${input}"`)
    this.name = 'InvalidPhoneError'
  }
}

// Nigerian mobile numbers: optional +234 / 234 / 0 prefix, then 10 digits starting 70x, 80x, 81x, 90x, 91x.
const NG_MOBILE = /^(?:\+?234|0)([789][01]\d{8})$/

/**
 * Normalise a Nigerian mobile number to E.164 (`+2348031234567`).
 * Accepts `0803…`, `234803…`, `+234803…`, with spaces, dashes or brackets in between.
 */
export function normalisePhoneNG(input: string): string {
  const cleaned = input.replace(/[\s\-().]/g, '')
  const match = NG_MOBILE.exec(cleaned)
  if (!match?.[1]) throw new InvalidPhoneError(input)
  return `+234${match[1]}`
}
