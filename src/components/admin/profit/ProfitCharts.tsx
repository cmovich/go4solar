'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatNaira, formatPercent } from '@/lib/money'

const GREEN = '#2E8B3A'
const DARK = '#0E3B22'
const ORANGE = '#F47B20'
const BLUE = '#1B4E9B'

const short = (n: number) => {
  const a = Math.abs(n)
  const s =
    a >= 1e9
      ? `${(a / 1e9).toFixed(1)}bn`
      : a >= 1e6
        ? `${(a / 1e6).toFixed(1)}m`
        : a >= 1e3
          ? `${Math.round(a / 1e3)}k`
          : String(Math.round(a))
  return `${n < 0 ? '−' : ''}₦${s}`
}
const naira = (v: unknown) => formatNaira(Number(v))

function Panel({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-white p-4">
      <h3 className="text-brand-dark text-sm font-bold">{title}</h3>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
      <div className="mt-2 h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export type ProfitChartData = {
  /** Calendar months: actual (past) then projected (future). */
  timeline: { month: string; actual: number | null; projected: number | null; cumulative: number }[]
  forecastStarts: string
  byTenure: { key: string; avgNetProfit: number; avgAnnualReturn: number | null }[]
  byBand: { key: string; avgNetProfit: number; avgAnnualReturn: number | null }[]
  cash: { month: string; cashIn: number; funderOut: number }[]
  capital: { year: string; capitalNeeded: number }[]
  funderBalance: number
  risk: { par30Balance: number; provision: number; par30Share: number }
}

export function ProfitCharts({ d }: { d: ProfitChartData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="profit-charts">
      <Panel
        title="Monthly profit: actual against projected"
        note={`Forecast begins ${d.forecastStarts}`}
      >
        <ComposedChart data={d.timeline}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis tickFormatter={short} fontSize={11} width={64} />
          <Tooltip formatter={naira} />
          <Legend />
          <ReferenceLine
            x={d.forecastStarts}
            stroke={ORANGE}
            label={{ value: 'forecast', fontSize: 11, fill: ORANGE }}
          />
          <Bar dataKey="actual" name="Actual (collected)" fill={GREEN} />
          <Line
            dataKey="projected"
            name="Projected"
            stroke={BLUE}
            strokeDasharray="5 4"
            dot={false}
          />
        </ComposedChart>
      </Panel>

      <Panel title="Cumulative profit">
        <LineChart data={d.timeline}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis tickFormatter={short} fontSize={11} width={64} />
          <Tooltip formatter={naira} />
          <ReferenceLine x={d.forecastStarts} stroke={ORANGE} />
          <ReferenceLine y={0} stroke="#999" />
          <Line dataKey="cumulative" name="Cumulative" stroke={DARK} dot={false} />
        </LineChart>
      </Panel>

      <Panel title="Profit by tenure: per customer and annual return on funder money">
        <ComposedChart data={d.byTenure}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="key" fontSize={11} />
          <YAxis yAxisId="n" tickFormatter={short} fontSize={11} width={64} />
          <YAxis
            yAxisId="r"
            orientation="right"
            tickFormatter={(v) => formatPercent(Number(v))}
            fontSize={11}
          />
          <Tooltip
            formatter={(v, name) =>
              name === 'Annual return' ? formatPercent(Number(v), 1) : naira(v)
            }
          />
          <Legend />
          <Bar yAxisId="n" dataKey="avgNetProfit" name="Net profit per customer" fill={GREEN} />
          <Line yAxisId="r" dataKey="avgAnnualReturn" name="Annual return" stroke={ORANGE} />
        </ComposedChart>
      </Panel>

      <Panel title="Profit by deposit band: per customer and annual return on funder money">
        <ComposedChart data={d.byBand}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="key" fontSize={11} />
          <YAxis yAxisId="n" tickFormatter={short} fontSize={11} width={64} />
          <YAxis
            yAxisId="r"
            orientation="right"
            tickFormatter={(v) => formatPercent(Number(v))}
            fontSize={11}
          />
          <Tooltip
            formatter={(v, name) =>
              name === 'Annual return' ? formatPercent(Number(v), 1) : naira(v)
            }
          />
          <Legend />
          <Bar yAxisId="n" dataKey="avgNetProfit" name="Net profit per customer" fill={GREEN} />
          <Line yAxisId="r" dataKey="avgAnnualReturn" name="Annual return" stroke={ORANGE} />
        </ComposedChart>
      </Panel>

      <Panel title="Cash in from customers against repayments out to funders">
        <BarChart data={d.cash}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis tickFormatter={short} fontSize={11} width={64} />
          <Tooltip formatter={naira} />
          <Legend />
          <Bar dataKey="cashIn" name="Cash in" fill={GREEN} />
          <Bar dataKey="funderOut" name="Funder repayments" fill={ORANGE} />
        </BarChart>
      </Panel>

      <Panel title="Funder money needed (base forecast) against balances available">
        <BarChart data={d.capital}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" fontSize={11} />
          <YAxis tickFormatter={short} fontSize={11} width={64} />
          <Tooltip formatter={naira} />
          <ReferenceLine
            y={d.funderBalance}
            stroke={ORANGE}
            label={{ value: 'balances today', fontSize: 11, fill: ORANGE }}
          />
          <Bar dataKey="capitalNeeded" name="Funder money needed" fill={BLUE} />
        </BarChart>
      </Panel>

      <Panel
        title="PAR30 against the loss provision"
        note={`${formatPercent(d.risk.par30Share, 1)} of the outstanding balance is 30+ days late`}
      >
        <BarChart
          data={[{ name: 'Today', par30: d.risk.par30Balance, provision: d.risk.provision }]}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={11} />
          <YAxis tickFormatter={short} fontSize={11} width={64} />
          <Tooltip formatter={naira} />
          <Legend />
          <Bar dataKey="par30" name="Balance 30+ days late" fill={ORANGE} />
          <Bar dataKey="provision" name="Provision" fill={DARK} />
        </BarChart>
      </Panel>
    </div>
  )
}
