'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyPoint } from '@/features/meta-ads/contracts'

export default function DailyTrendChart({ daily }: { daily: DailyPoint[] }) {
  return (
    <div className="card p-4" dir="ltr">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={daily}>
          <XAxis dataKey="date" />
          <YAxis yAxisId="spend" orientation="left" />
          <YAxis yAxisId="results" orientation="right" allowDecimals={false} />
          <Tooltip />
          <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="#6437fc" strokeWidth={2} dot={false} />
          <Line yAxisId="results" type="monotone" dataKey="results" stroke="#22c55e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}