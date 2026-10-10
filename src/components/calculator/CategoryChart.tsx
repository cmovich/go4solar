'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { CATEGORY_LABELS } from '@/lib/load/categories'
import { CATEGORY_IDS, type CategoryId } from '@/lib/load/types'

const SHORT: Record<CategoryId, string> = {
  lighting: 'Lighting',
  tv_electronics: 'TV & electronics',
  kitchen: 'Kitchen',
  cooling: 'Cooling',
  laundry: 'Laundry',
  water_outdoor: 'Water & outdoor',
  business: 'Business',
}

export function CategoryChart({ byCategoryW }: { byCategoryW: Record<CategoryId, number> }) {
  const data = CATEGORY_IDS.filter((id) => byCategoryW[id] > 0).map((id) => ({
    id,
    name: SHORT[id],
    full: CATEGORY_LABELS[id],
    watts: byCategoryW[id],
  }))

  return (
    <div className="h-56 w-full" role="img" aria-label="Running watts by category">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fontSize: 12 }} unit=" W" />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => [`${Number(value).toLocaleString('en-US')} W`, 'Running']}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.full ?? ''}
          />
          <Bar dataKey="watts" fill="#2E8B3A" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
