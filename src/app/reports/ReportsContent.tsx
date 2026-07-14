'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  TrendingUp, DollarSign, Users, Handshake, Percent,
} from 'lucide-react'
import type { Loan, Payment, Client } from '@/types'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

interface Props {
  loans: Loan[]
  payments: Payment[]
  clients: Client[]
}

export default function ReportsContent({ loans, payments, clients }: Props) {
  const [period, setPeriod] = useState<'all' | 'month' | 'quarter' | 'year'>('all')

  const stats = useMemo(() => {
    const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'late')
    const paidLoans = loans.filter(l => l.status === 'paid')
    const lateLoans = loans.filter(l => l.status === 'late')

    const totalCapital = activeLoans.reduce((s, l) => s + Number(l.amount), 0)
    const recoveredCapital = payments
      .filter(p => p.status === 'paid')
      .reduce((s, p) => s + Number(p.capital_amount), 0)
    const pendingCapital = Math.max(0, totalCapital - recoveredCapital)
    const generatedInterest = loans.reduce((s, l) => s + Number(l.total_interest), 0)
    const collectedInterest = payments.reduce((s, p) => s + Number(p.interest_amount), 0)
    const activeClients = clients.filter(c => c.status === 'active').length
    const lateClientIds = new Set(lateLoans.map(l => l.client_id))

    const portfolioHealth = activeLoans.length > 0
      ? Math.round(((activeLoans.length - lateLoans.length) / activeLoans.length) * 100)
      : 100

    return {
      totalCapital, recoveredCapital, pendingCapital,
      generatedInterest, collectedInterest,
      activeLoans: activeLoans.length,
      paidLoans: paidLoans.length,
      lateLoans: lateLoans.length,
      activeClients, lateClients: lateClientIds.size,
      portfolioHealth,
    }
  }, [loans, payments, clients])

  const statusData = useMemo(() => {
    return [
      { name: 'Activos', value: stats.activeLoans },
      { name: 'Pagados', value: stats.paidLoans },
      { name: 'Atrasados', value: stats.lateLoans },
    ].filter(d => d.value > 0)
  }, [stats])

  const monthlyData = useMemo(() => {
    const monthMap: Record<string, { income: number; loans: number }> = {}

    payments.forEach(p => {
      const month = p.payment_date.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { income: 0, loans: 0 }
      monthMap[month].income += Number(p.amount)
    })

    loans.forEach(l => {
      const month = l.created_at?.slice(0, 7)
      if (!month || !monthMap[month]) return
      monthMap[month].loans += Number(l.amount)
    })

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleString('es-MX', { month: 'short' }),
        ...data,
      }))
  }, [loans, payments])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Estadísticas y análisis de tu cartera"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
            <Handshake className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{stats.activeLoans}</p>
            <p className="text-xs text-muted-foreground">Préstamos activos</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-success-light flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-success" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{formatNumber(stats.recoveredCapital)}</p>
            <p className="text-xs text-muted-foreground">Capital recuperado</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{formatNumber(stats.collectedInterest)}</p>
            <p className="text-xs text-muted-foreground">Intereses cobrados</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Percent className="h-4 w-4 md:h-5 md:w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{stats.portfolioHealth}%</p>
            <p className="text-xs text-muted-foreground">Salud cartera</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Ingresos vs Préstamos</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                <Bar dataKey="income" name="Ingresos" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="loans" name="Préstamos" fill="#93C5FD" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Estado de préstamos</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {statusData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <p className="text-xs text-muted-foreground">Capital prestado total</p>
          <p className="text-lg font-bold text-foreground">{formatNumber(stats.totalCapital)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">Capital pendiente</p>
          <p className="text-lg font-bold text-warning">{formatNumber(stats.pendingCapital)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">Clientes activos</p>
          <p className="text-lg font-bold text-foreground">{stats.activeClients}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">Clientes morosos</p>
          <p className="text-lg font-bold text-destructive">{stats.lateClients}</p>
        </Card>
      </div>
    </div>
  )
}
