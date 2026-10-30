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
import { createElement, type ReactElement } from 'react'

import { siteConfig } from '@/config/site'
import { formatNaira } from '@/lib/money'

import { pdfAssets } from './assets'

// Same look as the agreement: dark-green band, Inter (has ₦), logo.
const DARK = '#0E3B22'
const GREEN = '#2E8B3A'
const GOLD = '#FFC94D'
const MIST = '#F4F8F5'
const MUTED = '#5B6B61'

Font.register({
  family: 'Inter',
  fonts: [
    { src: pdfAssets.interRegular, fontWeight: 400 },
    { src: pdfAssets.interBold, fontWeight: 700 },
  ],
})

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 10, color: '#1A1A1A', paddingBottom: 60 },
  band: { backgroundColor: DARK, paddingVertical: 22, paddingHorizontal: 44 },
  title: { color: 'white', fontSize: 18, fontWeight: 700 },
  sub: { color: GOLD, fontSize: 9, fontWeight: 700, marginTop: 4 },
  body: { paddingHorizontal: 44, paddingTop: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: '#DDE5DF',
  },
  label: { color: MUTED },
  value: { fontWeight: 700 },
  total: {
    marginTop: 16,
    backgroundColor: MIST,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalValue: { color: GREEN, fontSize: 16, fontWeight: 700 },
  note: { marginTop: 18, color: MUTED, fontSize: 9, lineHeight: 1.4 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: { width: 70 },
})

export type ReceiptInput = {
  receiptNo: string
  customerName: string
  planReference: string
  /** "Deposit" or "Payment 2 of 12". */
  label: string
  amount: number
  paidAt: string | null
  channel: string | null
  /** Still to pay after this payment. */
  amountLeft: number
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  })

function ReceiptDoc(r: ReceiptInput) {
  const rows: [string, string][] = [
    ['Receipt number', r.receiptNo],
    ['Customer', r.customerName],
    ['Plan reference', r.planReference],
    ['For', r.label],
    ['Paid on', r.paidAt ? day(r.paidAt) : '—'],
    ['Paid by', r.channel ? r.channel.replace(/_/g, ' ') : '—'],
    ['Still to pay after this payment', formatNaira(r.amountLeft)],
  ]
  return (
    <Document title={`Receipt ${r.receiptNo}`} author={siteConfig.legalName}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.title}>Payment receipt</Text>
          <Text style={s.sub}>{siteConfig.legalName}</Text>
        </View>
        <View style={s.body}>
          {rows.map(([k, v]) => (
            <View key={k} style={s.row}>
              <Text style={s.label}>{k}</Text>
              <Text style={s.value}>{v}</Text>
            </View>
          ))}
          <View style={s.total}>
            <Text style={s.value}>Amount paid</Text>
            <Text style={s.totalValue}>{formatNaira(r.amount)}</Text>
          </View>
          <Text style={s.note}>
            This receipt confirms a payment to {siteConfig.legalName}, {siteConfig.address} ·{' '}
            {siteConfig.email} · {siteConfig.phones.join(' · ')}.
          </Text>
        </View>
        <View style={s.footer} fixed>
          <Text style={{ color: MUTED, fontSize: 8 }}>{siteConfig.url}</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={pdfAssets.logo} style={s.logo} />
        </View>
      </Page>
    </Document>
  )
}

export async function renderReceiptPdf(r: ReceiptInput): Promise<Buffer> {
  return renderToBuffer(createElement(ReceiptDoc, r) as ReactElement<DocumentProps>)
}
