'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

interface Props {
  data: { month: string; income: number }[]
}

export default function AdminRevenueChart({ data }: Props) {
  const chartData = data.map(d => ({
    ...d,
    label: new Date(Number(d.month.slice(0, 4)), Number(d.month.slice(5, 7)) - 1, 1).toLocaleString('es-MX', { month: 'short' }),
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip formatter={(value: any) => `RD$${formatNumber(Number(value))}`} />
        <Bar dataKey="income" name="Ingresos" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}