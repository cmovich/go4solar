import { randomInt } from 'node:crypto'

import { OWN_INSTALLER_WARNING } from '@/lib/catalogue/extras'
import type { Company } from '@/lib/company/schema'
import type { NoMarkupLine, QuoteLine } from '@/lib/pricing/types'
import { validUntil } from '@/lib/quotes/quote'
import { quoteNotes, type SiteAnswers } from '@/lib/wizard/questions'

import { invoiceDay } from './dates'

export type InvoiceCustomer = {
  firstName: string
  name: string
  phone: string | null
  email: string | null
  /** LGA and state. */
  place: string | null
  businessName: string | null
}

export type InvoiceLine = {
  item: string
  /** Size or spec, e.g. "550 W", "6 mm²". */
  spec: string
  /** "2", or "20 m" for wire and pipe. */
  qty: string
  amount: number
  kind: 'equipment' | 'rack' | 'installation' | 'delivery'
}

/** Everything the invoice prints; stored with the invoice so it never changes afterwards. */
export type InvoiceData = {
  version: 1
  number: string
  publicCode: string
  verifyUrl: string
  issuedAt: string
  validUntil: string
  company: Company
  customer: InvoiceCustomer
  /** "Comfort plan", "Your own system". */
  title: string
  /** The quote reference (G4S-1A2B3C4D). */
  reference: string
  lines: InvoiceLine[]
  totals: {
    total: number
    deposit: number
    depositShare: number
    balance: number
    monthly: number
    months: number
  }
  notes: string[]
}

/** The priced quote the invoice is drawn from (customer figures only are read). */
type PricedQuote = {
  systemPrice: number
  deposit: number
  balance: number
  monthly: number
  installCost: number
  lines: Pick<QuoteLine, 'sku' | 'name' | 'qty' | 'lineTotal'>[]
  noMarkup?: NoMarkupLine[]
  snapshot: { tenureMonths: number; depositShare: number }
}

export type InvoiceInput = {
  number: string
  publicCode: string
  verifyUrl: string
  issuedAt: Date
  validityDays: number
  company: Company
  customer: InvoiceCustomer
  title: string
  reference: string
  result: PricedQuote
  /** Size/spec and unit per SKU, from the price list when the invoice is issued. */
  items: Record<string, { spec: string; unit: 'each' | 'metre' }>
  site: SiteAnswers
  roofNeedsRack: boolean
  installer: 'go4solar' | 'own'
  /** The quote uses the accessories pack (not itemised accessories). */
  packIncluded: boolean
}

const PACK_NOTE = 'Includes the standard accessories pack.'

/** The invoice's contents from a priced quote: lines, totals, notes and dates. Pure. */
export function buildInvoice(i: InvoiceInput): InvoiceData {
  const until = validUntil(i.issuedAt, i.validityDays)
  const extras: NoMarkupLine[] =
    i.result.noMarkup ??
    (i.result.installCost > 0
      ? [{ label: 'Installation and logistics', amount: i.result.installCost }]
      : [])
  const lines: InvoiceLine[] = [
    ...i.result.lines.map((l) => {
      const item = i.items[l.sku]
      return {
        item: l.name,
        spec: item?.spec ?? '',
        qty: item?.unit === 'metre' ? `${l.qty} m` : String(l.qty),
        amount: l.lineTotal,
        kind: l.sku.startsWith('RACK-') ? ('rack' as const) : ('equipment' as const),
      }
    }),
    ...extras.map((x) => ({
      item: x.label,
      spec: '',
      qty: '1',
      amount: x.amount,
      kind: x.label.startsWith('Delivery') ? ('delivery' as const) : ('installation' as const),
    })),
  ]
  const notes = quoteNotes(i.site, { needsRack: i.roofNeedsRack }).filter(
    (n) => n !== PACK_NOTE || i.packIncluded,
  )
  if (i.installer === 'own') notes.push(OWN_INSTALLER_WARNING)
  notes.push(`Prices valid until ${invoiceDay(until)}.`)
  return {
    version: 1,
    number: i.number,
    publicCode: i.publicCode,
    verifyUrl: i.verifyUrl,
    issuedAt: i.issuedAt.toISOString(),
    validUntil: until.toISOString(),
    company: i.company,
    customer: i.customer,
    title: i.title,
    reference: i.reference,
    lines,
    totals: {
      total: i.result.systemPrice,
      deposit: i.result.deposit,
      depositShare: i.result.snapshot.depositShare,
      balance: i.result.balance,
      monthly: i.result.monthly,
      months: i.result.snapshot.tenureMonths,
    },
    notes,
  }
}

const CODE_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'

/** The short random code in the verify link and QR code (12 characters, not guessable). */
export function newPublicCode(): string {
  return Array.from({ length: 12 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')
}
