'use client'

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCopy } from '@/hooks/useCopy'
import type { DailyPoint } from '@/features/meta-ads/contracts'

const SPEND_COLOR = '#6437fc'
const RESULTS_COLOR = '#10b981'

function shortDate(value: string): string {
  return value.length >= 10 ? value.slice(5).replace('-', '/') : value
}

function compactNumber(value: number): string {
  if (value >= 1000) {
    const k = Math.round(value / 100) / 10
    return `${k}k`
  }
  return String(value)
}

export default function DailyTrendChart({ daily }: { daily: DailyPoint[] }) {
  const { t } = useCopy()
  return (
    <div className="card p-4" dir="ltr">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#eef0fe" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} tick={{ fontSize: 11, fill: '#65738e' }} tickLine={false} axisLine={{ stroke: '#d4daeb' }} />
          <YAxis yAxisId="spend" orientation="left" tickFormatter={compactNumber} width={44} tick={{ fontSize: 11, fill: '#65738e' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="results" orientation="right" allowDecimals={false} width={36} tick={{ fontSize: 11, fill: '#65738e' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #d4daeb', background: '#ffffff', fontSize: 12, color: '#171926', boxShadow: '0 4px 16px rgba(17, 24, 39, 0.08)' }}
            labelStyle={{ color: '#42516b', fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="plainline" />
          <Line yAxisId="spend" type="monotone" dataKey="spend" name={t('adsSeriesSpend')} stroke={SPEND_COLOR} strokeWidth={2} dot={false} />
          <Line yAxisId="results" type="monotone" dataKey="results" name={t('adsSeriesResults')} stroke={RESULTS_COLOR} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}