'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface Props {
  data: { month: string; income: number; loans: number }[]
}

export default function DashboardBarChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
        <Bar dataKey="income" name="Ingresos" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="loans" name="Préstamos" fill="#93C5FD" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
