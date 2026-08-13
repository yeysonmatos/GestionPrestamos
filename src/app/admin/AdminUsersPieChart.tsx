'use client'

import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

interface Props {
  data: { plan_id: string; name: string; count: number }[]
}

const COLORS = ['#2563EB', '#8B5CF6', '#22C55E', '#F59E0B', '#EF4444', '#06B6D4']

export default function AdminUsersPieChart({ data }: Props) {
  const slices = data.filter(d => d.count > 0)

  if (slices.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Sin datos
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={slices}
          dataKey="count"
          nameKey="name"
          cx="50%"
          cy="45%"
          outerRadius={80}
          label={(entry: any) => `${formatNumber(entry.count)}`}
        >
          {slices.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: any) => `${formatNumber(Number(value))} usuarios`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}