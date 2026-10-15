'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatNaira } from '@/lib/money'

/** System price as the deposit share rises (admin price preview). */
export function PriceCurve({ data }: { data: { depositPct: number; systemPrice: number }[] }) {
  return (
    <div className="h-40 w-full" role="img" aria-label="System price against deposit share">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="depositPct" tick={{ fontSize: 10 }} unit="%" />
          <YAxis
            tick={{ fontSize: 10 }}
            width={56}
            tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
          />
          <Tooltip
            formatter={(value) => [formatNaira(Number(value)), 'System price']}
            labelFormatter={(label) => `${label}% deposit`}
          />
          <Line
            type="monotone"
            dataKey="systemPrice"
            stroke="#2E8B3A"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
