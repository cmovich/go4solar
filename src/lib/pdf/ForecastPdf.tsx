import path from 'node:path'

import {
  Document,
  Font,
  Image,
  Page,
  Polygon,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'

// Go4Solar document style (same as the agreement and waiting-list report).
const DARK = '#0E3B22'
const GREEN = '#2E8B3A'
const ORANGE = '#F47B20'
const GOLD = '#FFC94D'
const MIST = '#F4F8F5'
const MUTED = '#5B6B61'
const AMBER = '#9A5B00'

const publicDir = path.join(process.cwd(), 'public')
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(publicDir, 'fonts/Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(publicDir, 'fonts/Inter-Bold.ttf'), fontWeight: 700 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

const PAGE_W = 841.89 // A4 landscape
const BAND_H = 76

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 8.5,
    color: '#1A1A1A',
    paddingTop: BAND_H + 18,
    paddingBottom: 64,
    paddingHorizontal: 36,
  },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: BAND_H },
  bandTitle: {
    position: 'absolute',
    top: 20,
    left: 36,
    color: 'white',
    fontSize: 16,
    fontWeight: 700,
  },
  bandSub: { position: 'absolute', top: 42, left: 36, color: GOLD, fontSize: 9, fontWeight: 700 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageNo: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.2, borderColor: DARK },
  pageNoText: {
    position: 'absolute',
    top: 5,
    left: 0,
    width: 22,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: 700,
    color: DARK,
  },
  footNote: { fontSize: 7.5, color: MUTED },
  logo: { width: 70 },
  h2: { fontSize: 11, fontWeight: 700, color: DARK, marginTop: 8, marginBottom: 4 },
  cards: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  card: { flex: 1, backgroundColor: MIST, borderRadius: 6, padding: 8 },
  cardTitle: { fontSize: 10, fontWeight: 700, color: GREEN, marginBottom: 3 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#DDE5DF',
    paddingVertical: 3,
  },
  head: { flexDirection: 'row', backgroundColor: GREEN, paddingVertical: 4 },
  th: { color: 'white', fontWeight: 700 },
  sample: { color: AMBER, fontWeight: 700 },
})

export type ForecastPdfData = {
  name: string
  generatedAt: string
  variants: {
    label: string
    growth: string
    breakEven: string
    peakCapitalYear: number
    years: {
      year: number
      systems: string
      netProfit: string
      cumulativeNet: string
      capitalNeeded: string
      co2: string
      co2Cumulative: string
    }[]
  }[]
  inputs: { label: string; value: string; note: string | null }[]
  sampleCount: number
}

function Chrome({ title, sub, note }: { title: string; sub: string; note: string }) {
  const slope = 14
  return (
    <>
      <View style={s.band} fixed>
        <Svg width={PAGE_W} height={BAND_H} viewBox={`0 0 ${PAGE_W} ${BAND_H}`}>
          <Polygon points={`0,0 ${PAGE_W},0 ${PAGE_W},${BAND_H - slope} 0,${BAND_H}`} fill={DARK} />
          <Polygon
            points={`${PAGE_W - 60},0 ${PAGE_W},0 ${PAGE_W},${BAND_H - slope}`}
            fill={ORANGE}
          />
        </Svg>
        <Text style={s.bandTitle}>{title}</Text>
        <Text style={s.bandSub}>{sub}</Text>
      </View>
      <View style={s.footer} fixed>
        <View style={s.pageNo}>
          <Text
            style={s.pageNoText}
            fixed
            render={({ pageNumber }) => String(pageNumber).padStart(2, '0')}
          />
        </View>
        <Text style={s.footNote}>{note}</Text>
        {/* react-pdf Image, not an HTML img: no alt attribute exists */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image style={s.logo} src={path.join(publicDir, 'brand/go4solar-logo.png')} />
      </View>
    </>
  )
}

const COLS: [string, number][] = [
  ['Year', 0.5],
  ['Systems', 1],
  ['Net profit', 1.4],
  ['Cumulative net', 1.4],
  ['Funder money needed', 1.5],
  ['CO₂ tonnes', 1],
  ['CO₂ cumulative', 1],
]

function YearTable({ v }: { v: ForecastPdfData['variants'][number] }) {
  return (
    <View wrap={false}>
      <Text style={s.h2}>
        {v.label} (growth {v.growth} a year)
      </Text>
      <View style={s.head}>
        {COLS.map(([c, f]) => (
          <Text
            key={c}
            style={[
              s.th,
              { flex: f, paddingHorizontal: 4, textAlign: c === 'Year' ? 'left' : 'right' },
            ]}
          >
            {c}
          </Text>
        ))}
      </View>
      {v.years.map((y) => (
        <View key={y.year} style={s.row}>
          {[
            String(y.year),
            y.systems,
            y.netProfit,
            y.cumulativeNet,
            y.capitalNeeded,
            y.co2,
            y.co2Cumulative,
          ].map((cell, k) => (
            <Text
              key={k}
              style={{
                flex: COLS[k]![1],
                paddingHorizontal: 4,
                textAlign: k === 0 ? 'left' : 'right',
              }}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

export function ForecastDocument(d: ForecastPdfData) {
  const note = `Forecast · ${d.name} · ${d.generatedAt} · Go4Solar Energy Limited`
  return (
    <Document title={`Forecast: ${d.name}`} author="Go4Solar Energy Limited" creator="Go4Solar app">
      <Page size="A4" orientation="landscape" style={s.page}>
        <Chrome title={`Forecast: ${d.name}`} sub="Low · Base · High" note={note} />
        <View style={s.cards}>
          {d.variants.map((v) => (
            <View key={v.label} style={s.card}>
              <Text style={s.cardTitle}>{v.label}</Text>
              <Text>Break-even: {v.breakEven}</Text>
              <Text>
                Year {v.years.length} net profit: {v.years.at(-1)?.netProfit}
              </Text>
              <Text>Cumulative net: {v.years.at(-1)?.cumulativeNet}</Text>
              <Text>Peak funder money: year {v.peakCapitalYear}</Text>
              <Text>CO₂ avoided, cumulative: {v.years.at(-1)?.co2Cumulative} t</Text>
            </View>
          ))}
        </View>
        {d.sampleCount > 0 && (
          <Text style={s.sample}>
            {d.sampleCount} input(s) are SAMPLE or unverified values (marked on the inputs page).
            Replace them before sharing with funders.
          </Text>
        )}
        {d.variants.map((v) => (
          <YearTable key={v.label} v={v} />
        ))}
      </Page>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Chrome title="Inputs" sub={d.name} note={note} />
        {d.inputs.map((i) => (
          <View key={i.label} style={s.row}>
            <Text style={{ flex: 2 }}>{i.label}</Text>
            <Text style={{ flex: 1, textAlign: 'right', fontWeight: 700 }}>{i.value}</Text>
            <Text style={[{ flex: 2, paddingLeft: 8 }, i.note ? s.sample : {}]}>
              {i.note ?? 'From settings'}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export async function renderForecastPdf(d: ForecastPdfData): Promise<Buffer> {
  return renderToBuffer(
    createElement(ForecastDocument, d) as unknown as ReactElement<DocumentProps>,
  )
}
