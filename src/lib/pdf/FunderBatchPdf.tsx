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

import type { Company } from '@/lib/company/schema'
import { batchLabel } from '@/lib/tradeLenda/batch'
import { customerRows, summaryRows, type ExportBatch } from '@/lib/tradeLenda/exports'

import { pdfAssets } from './assets'

/** Trade Lenda batch PDF: logo, company details, batch number and date, the totals page first. */
const DARK = '#0E3B22'
const MIST = '#F4F8F5'
const MUTED = '#5B6B61'

Font.register({
  family: 'Inter',
  fonts: [
    { src: pdfAssets.interRegular, fontWeight: 400 },
    { src: pdfAssets.interBold, fontWeight: 700 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9, padding: 36, color: '#1A1A1A' },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  logo: { width: 90 },
  company: { fontSize: 8, color: MUTED, textAlign: 'right' },
  title: { fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 2 },
  sub: { fontSize: 9, color: MUTED, marginBottom: 12 },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottom: '0.5pt solid #DDE5E0' },
  k: { width: '40%', color: MUTED },
  v: { width: '60%', fontWeight: 700 },
  band: { backgroundColor: MIST, padding: 6, marginTop: 10, marginBottom: 4, fontWeight: 700 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 7, color: MUTED },
})

function Header({ b, company }: { b: ExportBatch; company: Company }) {
  return (
    <View style={s.head} fixed>
      {/* react-pdf Image, not an HTML img: no alt attribute exists */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image style={s.logo} src={pdfAssets.logo} />
      <View>
        <Text style={s.company}>{company.name}</Text>
        <Text style={s.company}>{company.address}</Text>
        <Text style={s.company}>
          {company.phone} · {company.email}
        </Text>
        <Text style={s.company}>
          {batchLabel(b.number, b.version, b.lendingType)} · {b.createdAt.slice(0, 10)}
        </Text>
      </View>
    </View>
  )
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([k, v]) => (
        <View key={k} style={s.row} wrap={false}>
          <Text style={s.k}>{k}</Text>
          <Text style={s.v}>{v}</Text>
        </View>
      ))}
    </View>
  )
}

export function FunderBatchDocument({ b, company }: { b: ExportBatch; company: Company }) {
  return (
    <Document title={batchLabel(b.number, b.version, b.lendingType)} author={company.name}>
      <Page size="A4" style={s.page}>
        <Header b={b} company={company} />
        <Text style={s.title}>Batch summary</Text>
        <Text style={s.sub}>{batchLabel(b.number, b.version, b.lendingType)}</Text>
        <Rows rows={summaryRows(b)} />
        <Text style={s.footer} fixed>
          {company.name} · Confidential: prepared for the funder named on this batch.
        </Text>
      </Page>
      {b.customers.map((c) => (
        <Page key={c.reference} size="A4" style={s.page}>
          <Header b={b} company={company} />
          <Text style={s.title}>{c.name}</Text>
          <Text style={s.sub}>
            {c.reference} · decision: {b.decisions[c.reference]?.decision ?? 'pending'}
          </Text>
          <Rows rows={customerRows(c)} />
          <Text style={s.footer} fixed>
            {company.name} · Confidential: prepared for the funder named on this batch.
          </Text>
        </Page>
      ))}
    </Document>
  )
}

export async function renderFunderBatchPdf(b: ExportBatch, company: Company): Promise<Buffer> {
  return renderToBuffer(
    createElement(FunderBatchDocument, { b, company }) as unknown as ReactElement<DocumentProps>,
  )
}
