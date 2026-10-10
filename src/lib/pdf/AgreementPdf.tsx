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

// Go4Solar document style: dark-green header band with an angled edge and orange tab, outlined
// circle page numbers, logo bottom-right, Inter, green accents.
const DARK = '#0E3B22'
const GREEN = '#2E8B3A'
const ORANGE = '#F47B20'
const GOLD = '#FFC94D'
const MIST = '#F4F8F5'
const MUTED = '#5B6B61'

const publicDir = path.join(process.cwd(), 'public')
Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(publicDir, 'fonts/Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(publicDir, 'fonts/Inter-Bold.ttf'), fontWeight: 700 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

const PAGE_W = 595.28
const BAND_H = 84

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    lineHeight: 1.45,
    color: '#1A1A1A',
    paddingTop: BAND_H + 22,
    paddingBottom: 70,
    paddingHorizontal: 44,
  },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: BAND_H },
  bandTitle: {
    position: 'absolute',
    top: 24,
    left: 44,
    color: 'white',
    fontSize: 16,
    fontWeight: 700,
  },
  bandSub: { position: 'absolute', top: 46, left: 44, color: GOLD, fontSize: 9, fontWeight: 700 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageNo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.2,
    borderColor: DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNoText: { fontSize: 9, fontWeight: 700, color: DARK },
  footNote: { fontSize: 7.5, color: MUTED },
  logo: { width: 74 },
  h1: { fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 6 },
  h2: { fontSize: 10.5, fontWeight: 700, color: GREEN, marginTop: 10, marginBottom: 3 },
  p: { marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 2 },
  draft: { color: '#B42318', fontWeight: 700, marginBottom: 6 },
  sigBox: {
    marginTop: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DDE5DF',
    borderRadius: 6,
    backgroundColor: MIST,
  },
  sigImg: { height: 70, objectFit: 'contain', marginVertical: 6 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#DDE5DF',
    paddingVertical: 5,
  },
  k: { width: 150, color: MUTED },
  v: { flex: 1, fontWeight: 700 },
  hash: { fontSize: 8, fontWeight: 700, color: DARK },
})

function Band({ title, sub }: { title: string; sub: string }) {
  const slope = 16
  return (
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
  )
}

function Footer({ note }: { note: string }) {
  return (
    <View style={s.footer} fixed>
      <View style={s.pageNo}>
        <Text style={s.pageNoText} render={({ pageNumber }) => String(pageNumber)} />
      </View>
      <Text style={s.footNote}>{note}</Text>
      {/* react-pdf Image, not an HTML img: no alt attribute exists */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image style={s.logo} src={path.join(publicDir, 'brand/go4solar-logo.png')} />
    </View>
  )
}

/** Minimal Markdown: # / ## headings, "- " bullets, **bold** spans, paragraphs. */
function Markdown({ text }: { text: string }) {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <Text key={i} style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </Text>
      ) : (
        <Text key={i}>{part}</Text>
      ),
    )
  return (
    <View>
      {text.split('\n').map((raw, i) => {
        const line = raw.trimEnd()
        if (!line.trim()) return null
        if (line.startsWith('# '))
          return (
            <Text key={i} style={s.h1}>
              {line.slice(2)}
            </Text>
          )
        if (line.startsWith('## '))
          return (
            <Text key={i} style={s.h2} minPresenceAhead={40}>
              {line.slice(3)}
            </Text>
          )
        if (line.includes('DRAFT — lawyer review required'))
          return (
            <Text key={i} style={s.draft}>
              {line.replace(/\*/g, '')}
            </Text>
          )
        if (line.startsWith('- '))
          return (
            <View key={i} style={s.bullet}>
              <Text>• </Text>
              <Text style={{ flex: 1 }}>{bold(line.slice(2))}</Text>
            </View>
          )
        return (
          <Text key={i} style={s.p}>
            {bold(line)}
          </Text>
        )
      })}
    </View>
  )
}

export type AuditRow = { label: string; value: string }

export function AgreementDocument({
  title,
  reference,
  text,
  signaturePng,
  signerName,
  signerTitle,
  audit,
  fingerprint,
}: {
  title: string
  reference: string
  text: string
  signaturePng: Buffer
  signerName: string
  signerTitle: string | null
  audit: AuditRow[]
  fingerprint: string
}) {
  const note = `${reference} · Go4Solar Energy Limited`
  return (
    <Document title={title} author="Go4Solar Energy Limited" creator="Go4Solar app">
      <Page size="A4" style={s.page}>
        <Band title={title} sub={`Reference ${reference}`} />
        <Footer note={note} />
        <Markdown text={text} />
        <View style={s.sigBox} wrap={false}>
          <Text style={{ color: MUTED }}>Signature</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.sigImg} src={{ data: signaturePng, format: 'png' }} />
          <Text style={{ fontWeight: 700 }}>
            {signerName}
            {signerTitle ? `, ${signerTitle}` : ''}
          </Text>
        </View>
      </Page>
      <Page size="A4" style={s.page}>
        <Band title="Signing record" sub={`Reference ${reference}`} />
        <Footer note={note} />
        <Text style={s.h1}>Audit record</Text>
        {audit.map((r) => (
          <View key={r.label} style={s.row}>
            <Text style={s.k}>{r.label}</Text>
            <Text style={s.v}>{r.value}</Text>
          </View>
        ))}
        <Text style={s.h2}>Document fingerprint (SHA-256)</Text>
        <Text style={s.hash}>{fingerprint}</Text>
        <Text style={[s.p, { marginTop: 8, color: MUTED }]}>
          The fingerprint covers the agreement text, the signature image and the details above. The
          SHA-256 of this PDF file is kept on Go4Solar&apos;s records for tamper checks.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderAgreementPdf(
  props: Parameters<typeof AgreementDocument>[0],
): Promise<Buffer> {
  return renderToBuffer(
    createElement(AgreementDocument, props) as unknown as ReactElement<DocumentProps>,
  )
}
