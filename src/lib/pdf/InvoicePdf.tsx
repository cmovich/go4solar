import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { createElement, type ReactElement } from 'react'

import type { InvoiceData } from '@/lib/invoices/build'
import { invoiceDay } from '@/lib/invoices/dates'
import { formatNaira, formatPercent } from '@/lib/money'

import { pdfAssets } from './assets'

// Same look as the agreement and receipts: Inter (has ₦), brand colours, the colour logo.
const DARK = '#0E3B22'
const GREEN = '#2E8B3A'
const GOLD = '#FFC94D'
const MIST = '#F4F8F5'
const MUTED = '#5B6B61'
const LINE = '#DDE5DF'

Font.register({
  family: 'Inter',
  fonts: [
    { src: pdfAssets.interRegular, fontWeight: 400 },
    { src: pdfAssets.interBold, fontWeight: 700 },
  ],
})

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9, color: '#1A1A1A', paddingBottom: 56 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 16,
  },
  logo: { width: 120 },
  company: { alignItems: 'flex-end', maxWidth: 260 },
  companyName: { fontSize: 11, fontWeight: 700, color: DARK },
  companyLine: { color: MUTED, marginTop: 2, textAlign: 'right' },
  band: {
    backgroundColor: DARK,
    paddingVertical: 12,
    paddingHorizontal: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bandTitle: { color: 'white', fontSize: 18, fontWeight: 700 },
  bandNumber: { color: GOLD, fontSize: 11, fontWeight: 700 },
  body: { paddingHorizontal: 40, paddingTop: 16 },
  twoCols: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  col: { width: '48%' },
  h: { fontSize: 8, fontWeight: 700, color: GREEN, marginBottom: 4, letterSpacing: 1 },
  kv: { flexDirection: 'row', marginBottom: 2 },
  k: { width: 80, color: MUTED },
  v: { flex: 1, fontWeight: 700 },
  th: {
    flexDirection: 'row',
    backgroundColor: GREEN,
    color: 'white',
    fontWeight: 700,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  cItem: { width: '44%' },
  cSpec: { width: '22%' },
  cQty: { width: '12%', textAlign: 'right' },
  cAmt: { width: '22%', textAlign: 'right' },
  totals: { marginTop: 10, marginLeft: '50%', backgroundColor: MIST, padding: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  totalBig: { fontSize: 13, fontWeight: 700, color: GREEN },
  notes: { marginTop: 14 },
  note: { color: MUTED, marginBottom: 2, lineHeight: 1.35 },
  verify: { marginTop: 14, flexDirection: 'row', alignItems: 'center' },
  qr: { width: 72, height: 72, marginRight: 10 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: MUTED,
    fontSize: 8,
  },
})

/** The printed short link (no "https://"). */
const shortLink = (url: string) => url.replace(/^https?:\/\//, '')

function InvoiceDoc({ d, qr }: { d: InvoiceData; qr: string }) {
  const c = d.company
  const customer: [string, string | null][] = [
    ['Name', d.customer.name],
    ['Business', d.customer.businessName],
    ['Phone', d.customer.phone],
    ['Email', d.customer.email],
    ['Location', d.customer.place],
  ]
  const details: [string, string][] = [
    ['Invoice no.', d.number],
    ['Date', invoiceDay(d.issuedAt)],
    ['Valid until', invoiceDay(d.validUntil)],
    ['For', d.title],
    ['Quote ref.', d.reference],
  ]
  return (
    <Document title={`Invoice ${d.number}`} author={c.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={pdfAssets.logo} style={s.logo} />
          <View style={s.company}>
            <Text style={s.companyName}>{c.name}</Text>
            <Text style={s.companyLine}>{c.address}</Text>
            <Text style={s.companyLine}>
              {c.phone} · {c.email}
            </Text>
            <Text style={s.companyLine}>{c.website}</Text>
            {c.rcNumber && <Text style={s.companyLine}>{c.rcNumber}</Text>}
          </View>
        </View>
        <View style={s.band}>
          <Text style={s.bandTitle}>Invoice</Text>
          <Text style={s.bandNumber}>{d.number}</Text>
        </View>
        <View style={s.body}>
          <View style={s.twoCols}>
            <View style={s.col}>
              <Text style={s.h}>BILL TO</Text>
              {customer
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <View key={k} style={s.kv}>
                    <Text style={s.k}>{k}</Text>
                    <Text style={s.v}>{v}</Text>
                  </View>
                ))}
            </View>
            <View style={s.col}>
              <Text style={s.h}>DETAILS</Text>
              {details.map(([k, v]) => (
                <View key={k} style={s.kv}>
                  <Text style={s.k}>{k}</Text>
                  <Text style={s.v}>{v}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={s.th}>
            <Text style={s.cItem}>Item</Text>
            <Text style={s.cSpec}>Size / spec</Text>
            <Text style={s.cQty}>Qty / length</Text>
            <Text style={s.cAmt}>Price</Text>
          </View>
          {d.lines.map((l, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.cItem}>{l.item}</Text>
              <Text style={s.cSpec}>{l.spec}</Text>
              <Text style={s.cQty}>{l.qty}</Text>
              <Text style={s.cAmt}>{formatNaira(l.amount)}</Text>
            </View>
          ))}

          <View style={s.totals} wrap={false}>
            <View style={s.totalRow}>
              <Text style={{ fontWeight: 700 }}>Total amount payable</Text>
              <Text style={s.totalBig}>{formatNaira(d.totals.total)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text>Deposit ({formatPercent(d.totals.depositShare)})</Text>
              <Text style={{ fontWeight: 700 }}>{formatNaira(d.totals.deposit)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text>Monthly payment</Text>
              <Text style={{ fontWeight: 700 }}>
                {formatNaira(d.totals.monthly)} × {d.totals.months} months
              </Text>
            </View>
            <Text style={{ color: MUTED, marginTop: 4 }}>
              0% interest: the total above is everything you pay. Late payments attract 0.75% of the
              overdue amount per day.
            </Text>
          </View>

          <View style={s.notes} wrap={false}>
            <Text style={s.h}>NOTES</Text>
            {d.notes.map((n) => (
              <Text key={n} style={s.note}>
                • {n}
              </Text>
            ))}
          </View>

          <View style={s.verify} wrap={false}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={qr} style={s.qr} />
            <View>
              <Text style={{ fontWeight: 700 }}>Check this invoice is genuine</Text>
              <Text style={{ color: MUTED, marginTop: 2 }}>
                Scan the code or open {shortLink(d.verifyUrl)}
              </Text>
            </View>
          </View>
        </View>
        <View style={s.footer} fixed>
          <Text>
            {c.name} · {d.number}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

/** The invoice as a PDF (server side), with a QR code for the verify link. */
export async function renderInvoicePdf(d: InvoiceData): Promise<Buffer> {
  const qr = await QRCode.toDataURL(d.verifyUrl, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
  })
  return renderToBuffer(createElement(InvoiceDoc, { d, qr }) as ReactElement<DocumentProps>)
}
