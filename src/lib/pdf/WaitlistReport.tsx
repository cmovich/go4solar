import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Svg,
  Text,
  View,
  Polygon,
} from '@react-pdf/renderer'

import { formatNaira, formatPercent } from '@/lib/money'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import type { EnergySettings } from '@/lib/settings/schemas'
import type { ConsumerLead, Headline } from '@/lib/waitlist/admin'
import { READY_WHEN_LABELS, STATE_LABELS } from '@/lib/waitlist/schema'

import { pdfAssets } from './assets'

// Go4Solar document style (proposal look): dark-green header band with an angled bottom-right
// edge and an orange tab, outlined circle page numbers, logo bottom-right, Inter, green tables.
const DARK = '#0E3B22'
const GREEN = '#2E8B3A'
const ORANGE = '#F47B20'
const GOLD = '#FFC94D'
const MIST = '#F4F8F5'
const INK = '#1A1A1A'
const MUTED = '#5B6B61'

Font.register({
  family: 'Inter',
  fonts: [
    { src: pdfAssets.interRegular, fontWeight: 400 },
    { src: pdfAssets.interBold, fontWeight: 700 },
  ],
})
// Keep the ₦ sign and numbers unbroken.
Font.registerHyphenationCallback((word) => [word])

const PAGE_W = 595.28 // A4 points
const BAND_H = 92

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: INK,
    paddingTop: BAND_H + 24,
    paddingBottom: 70,
    paddingHorizontal: 40,
  },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: BAND_H },
  bandTitle: {
    position: 'absolute',
    top: 26,
    left: 40,
    color: 'white',
    fontSize: 18,
    fontWeight: 700,
  },
  bandSub: { position: 'absolute', top: 50, left: 40, color: GOLD, fontSize: 10, fontWeight: 700 },
  bandRight: {
    position: 'absolute',
    top: 30,
    right: 40,
    color: 'white',
    fontSize: 9,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
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
  confidential: { fontSize: 8, color: MUTED, letterSpacing: 1 },
  logo: { width: 78 },
  h2: { fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 8 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  card: { width: '31.5%', backgroundColor: MIST, borderRadius: 6, padding: 10 },
  cardLabel: { fontSize: 8, color: MUTED },
  cardValue: { fontSize: 14, fontWeight: 700, color: DARK, marginTop: 2 },
  cardHint: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  chartLabel: { width: 90, fontSize: 9 },
  chartTrack: { flex: 1, height: 10, backgroundColor: MIST, borderRadius: 5, overflow: 'hidden' },
  chartBar: { height: 10, backgroundColor: GREEN },
  chartValue: { width: 60, fontSize: 9, textAlign: 'right' },
  table: { marginTop: 4 },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#DDE5DF',
    minHeight: 16,
    alignItems: 'center',
  },
  th: { backgroundColor: GREEN, color: 'white', fontWeight: 700, fontSize: 8 },
  td: { fontSize: 8, paddingVertical: 3, paddingHorizontal: 4 },
  alt: { backgroundColor: MIST },
  note: { fontSize: 8, color: MUTED, marginTop: 10 },
})

const COLS: { key: string; label: string; w: number; align?: 'right' }[] = [
  { key: 'when', label: 'Date', w: 54 },
  { key: 'name', label: 'Name', w: 90 },
  { key: 'phone', label: 'Phone', w: 72 },
  { key: 'state', label: 'State', w: 56 },
  { key: 'plan', label: 'Plan', w: 70 },
  { key: 'deposit', label: 'Deposit', w: 62, align: 'right' },
  { key: 'monthly', label: 'Monthly', w: 56, align: 'right' },
  { key: 'total', label: 'Total', w: 62, align: 'right' },
]

function Band({ title, sub, right }: { title: string; sub: string; right: string }) {
  const slope = 18
  return (
    <View style={s.band} fixed>
      <Svg width={PAGE_W} height={BAND_H} viewBox={`0 0 ${PAGE_W} ${BAND_H}`}>
        <Polygon points={`0,0 ${PAGE_W},0 ${PAGE_W},${BAND_H - slope} 0,${BAND_H}`} fill={DARK} />
        <Polygon
          points={`${PAGE_W - 64},0 ${PAGE_W},0 ${PAGE_W},${BAND_H - slope}`}
          fill={ORANGE}
        />
      </Svg>
      <Text style={s.bandTitle}>{title}</Text>
      <Text style={s.bandSub}>{sub}</Text>
      <Text style={s.bandRight}>{right}</Text>
    </View>
  )
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <View style={s.pageNo}>
        <Text
          style={s.pageNoText}
          fixed
          render={({ pageNumber }) => String(pageNumber).padStart(2, '0')}
        />
      </View>
      <Text style={s.confidential}>CONFIDENTIAL · Go4Solar Energy Limited</Text>
      {/* react-pdf Image, not an HTML img: no alt attribute exists */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image style={s.logo} src={pdfAssets.logo} />
    </View>
  )
}

const tonnes = (kg: number) => (kg / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })

export function WaitlistReport({
  stats,
  leads,
  generatedAt,
  energy,
}: {
  stats: Headline
  leads: ConsumerLead[]
  generatedAt: Date
  energy: EnergySettings
}) {
  const when = generatedAt.toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'long',
    timeStyle: 'short',
  })
  const maxState = Math.max(1, ...stats.byState.map((b) => b.count))
  const cards = [
    {
      label: 'Total sign-ups',
      value: String(stats.total),
      hint: `${stats.complete} complete · ${stats.incomplete} incomplete leads`,
    },
    {
      label: 'Total system value',
      value: formatNaira(stats.systemValue),
      hint: 'Chosen plans, complete sign-ups',
    },
    { label: 'Deposits pledged', value: formatNaira(stats.depositsPledged) },
    {
      label: 'Financing needed',
      value: formatNaira(stats.financingNeeded),
      hint: 'System value minus deposits',
    },
    {
      label: 'Average deposit',
      value: stats.averageDepositShare === null ? '—' : formatPercent(stats.averageDepositShare, 1),
    },
    {
      label: 'Ready to pay now',
      value: String(stats.readyNow),
      hint: `${stats.installers} installers registered`,
    },
    {
      label: 'CO₂ avoided per year',
      value: `${tonnes(stats.co2AvoidedKgPerYear)} tonnes`,
      hint: 'Chosen plans, energy spend known',
    },
    {
      label: 'Average monthly energy spend',
      value:
        stats.averageMonthlyEnergySpend === null
          ? '—'
          : formatNaira(stats.averageMonthlyEnergySpend),
      hint: 'Generator fuel + grid bills today',
    },
  ]

  return (
    <Document
      title="Go4Solar waiting list report"
      author="Go4Solar Energy Limited"
      creator="Go4Solar app"
    >
      <Page size="A4" style={s.page}>
        <Band
          title="Waiting list report"
          sub="Prelaunch demand · across Nigeria"
          right={`Generated ${when}`}
        />
        <Footer />

        <Text style={s.h2}>Summary</Text>
        <View style={s.cards}>
          {cards.map((c) => (
            <View key={c.label} style={s.card}>
              <Text style={s.cardLabel}>{c.label}</Text>
              <Text style={s.cardValue}>{c.value}</Text>
              {c.hint ? <Text style={s.cardHint}>{c.hint}</Text> : null}
            </View>
          ))}
        </View>

        <Text style={s.h2}>Sign-ups by state</Text>
        {stats.byState.length === 0 ? (
          <Text style={s.note}>No sign-ups yet.</Text>
        ) : (
          stats.byState.map((b) => (
            <View key={b.state} style={s.chartRow}>
              <Text style={s.chartLabel}>{STATE_LABELS[b.state] ?? b.state}</Text>
              <View style={s.chartTrack}>
                <View
                  style={[s.chartBar, { width: `${Math.round((b.count / maxState) * 100)}%` }]}
                />
              </View>
              <Text style={s.chartValue}>
                {b.count} ({stats.total ? Math.round((b.count / stats.total) * 100) : 0}%) ·{' '}
                {tonnes(b.co2AvoidedKg)} t CO₂
              </Text>
            </View>
          ))
        )}

        <Text style={s.h2}>Homes and businesses</Text>
        <View style={s.cards}>
          {(['individual', 'business'] as const).map((k) => (
            <View key={k} style={s.card}>
              <Text style={s.cardLabel}>
                {k === 'individual' ? 'Homes (individuals)' : 'Businesses'}
              </Text>
              <Text style={s.cardValue}>{stats.byType[k].count}</Text>
              <Text style={s.cardHint}>
                {formatNaira(stats.byType[k].systemValue)} system value ·{' '}
                {formatNaira(stats.byType[k].financingNeeded)} financing ·{' '}
                {tonnes(stats.byType[k].co2AvoidedKg)} t CO₂/yr
              </Text>
            </View>
          ))}
          {stats.byType.unknown.count > 0 ? (
            <View style={s.card}>
              <Text style={s.cardLabel}>Not stated</Text>
              <Text style={s.cardValue}>{stats.byType.unknown.count}</Text>
            </View>
          ) : null}
        </View>

        <Text style={s.note}>
          Estimates are priced at 12 months with 0% interest to the customer; the deposit is each
          sign-up&apos;s own choice between 20% and 95%.{' '}
          {stats.sample ? 'Prices are SAMPLE values pending the final price list. ' : ''}
          Consent to be contacted was given by every complete sign-up.
        </Text>
        <Text style={s.note}>
          Carbon figures use: petrol {formatNaira(energy.fuelPricePerLitre.petrol)}/L and diesel{' '}
          {formatNaira(energy.fuelPricePerLitre.diesel)}/L{energy.sample ? ' (SAMPLE prices)' : ''};
          emission factors petrol {energy.emissionFactorKgPerLitre.petrol} kg CO₂/L, diesel{' '}
          {energy.emissionFactorKgPerLitre.diesel} kg CO₂/L; grid{' '}
          {formatNaira(energy.grid.tariffPerKwh)}/kWh at {energy.grid.factorKgPerKwh} kg CO₂/kWh
          {energy.grid.verified ? '' : ' (UNVERIFIED grid factor)'}. Every plan avoids the generator
          fuel; only 24-Hour Independence also avoids the grid.
        </Text>
      </Page>

      <Page size="A4" style={s.page}>
        <Band
          title="Complete sign-ups"
          sub={`${leads.length} customers`}
          right={`Generated ${when}`}
        />
        <Footer />
        <View style={s.table}>
          <View style={[s.tr, s.th]} fixed>
            {COLS.map((c) => (
              <Text
                key={c.key}
                style={[
                  s.td,
                  { width: c.w, textAlign: c.align ?? 'left', color: 'white', fontWeight: 700 },
                ]}
              >
                {c.label}
              </Text>
            ))}
          </View>
          {leads.map((l, i) => {
            const cells: Record<string, string> = {
              when: fmtDate(l.createdAt),
              name: [l.firstName, l.surname].filter(Boolean).join(' ') || '—',
              phone: l.phone,
              state: l.state ? (STATE_LABELS[l.state] ?? l.state) : '—',
              plan: l.plan ? PLAN_LABELS[l.plan] : '—',
              deposit:
                l.depositShare !== null
                  ? `${formatPercent(l.depositShare)} · ${formatNaira(l.deposit ?? 0)}`
                  : '—',
              monthly: l.monthly !== null ? formatNaira(l.monthly) : '—',
              total: l.systemPrice !== null ? formatNaira(l.systemPrice) : '—',
            }
            return (
              <View key={l.id} style={[s.tr, i % 2 ? s.alt : {}]} wrap={false}>
                {COLS.map((c) => (
                  <Text key={c.key} style={[s.td, { width: c.w, textAlign: c.align ?? 'left' }]}>
                    {cells[c.key]}
                  </Text>
                ))}
              </View>
            )
          })}
          {leads.length === 0 && <Text style={s.note}>No complete sign-ups yet.</Text>}
        </View>
        <Text style={s.note}>
          Ready to pay: {leads.filter((l) => l.readyWhen === 'now').length} now ·{' '}
          {leads.filter((l) => l.readyWhen === '30_days').length}{' '}
          {READY_WHEN_LABELS['30_days'].toLowerCase()} ·{' '}
          {leads.filter((l) => l.readyWhen === 'later').length} later.
        </Text>
      </Page>
    </Document>
  )
}
