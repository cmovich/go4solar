/** Paystack takes and returns amounts in kobo (₦1 = 100 kobo), always whole numbers. */
export function toKobo(naira: number): number {
  if (!Number.isFinite(naira) || naira < 0) throw new Error('amount must be a positive number')
  return Math.round(naira * 100)
}

export function fromKobo(kobo: number): number {
  return Math.round(kobo) / 100
}
