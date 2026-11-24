'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCopy } from '@/hooks/useCopy'
import type { VideoCurvePoint } from '@/features/meta-ads/contracts'

// The ten printed ticks; a category axis maps each non-linear label to its index so
// all 22 points still render and hover, but only these ten labels are drawn.
const TICKS = ['0:00', '0:05', '0:10', '0:15', '0:20', '0:25', '0:30', '0:40', '0:50', '1:00+']

export default function VideoCurveChart({ curve }: { curve: VideoCurvePoint[] }) {
  const { t } = useCopy()
  return (
    <div className="mt-3" dir="ltr">
      <p className="mb-2 text-xs font-semibold text-ink-700">{t('adsVideoCurve')}</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={curve}>
          <XAxis dataKey="label" type="category" ticks={TICKS} />
          <YAxis domain={[0, 100]} tickFormatter={(value) => value + '%'} />
          <Tooltip />
          <Line type="monotone" dataKey="percent" stroke="#6437fc" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}