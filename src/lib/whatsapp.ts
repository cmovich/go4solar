/**
 * wa.me needs international digits with no "+" (e.g. 2348182112423). Admin may type the number
 * in any common Nigerian format; this makes the link work whatever they entered.
 */
export function whatsappDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7) return null
  // Nigerian local formats: 0803… (11 digits) or bare 803… (10 digits) → prefix 234.
  if (digits.length === 11 && digits.startsWith('0')) return `234${digits.slice(1)}`
  if (digits.length === 10 && /^[789]/.test(digits)) return `234${digits}`
  return digits
}

/** `https://wa.me/<digits>` with an optional pre-filled message; falls back to another number. */
export function whatsappHref(raw: string, text?: string, fallback?: string): string {
  const digits = whatsappDigits(raw) ?? (fallback ? whatsappDigits(fallback) : null) ?? ''
  const query = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${digits}${query}`
}
