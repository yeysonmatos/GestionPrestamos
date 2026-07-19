'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Wallet, PiggyBank, CurrencyDollar, TrendUp, Users, Warning,
  Calendar, ArrowRight,
} from '@phosphor-icons/react'
import type { Loan, Payment, Client, Installment } from '@/types'

interface Props {
  loans: Loan[]
  payments: Payment[]
  clients: Client[]
  todayPayments: Payment[]
  overdueInstallments: Installment[]
  upcomingInstallments: Installment[]
}

export default function DashboardContent({
  loans, payments, clients, todayPayments, overdueInstallments, upcomingInstallments,
}: Props) {
  const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'late')
  const lateLoans = loans.filter(l => l.status === 'late')

  const totalCapital = activeLoans.reduce((s, l) => s + Number(l.amount), 0)
  const recoveredCapital = payments
    .filter(p => p.status === 'paid')
    .reduce((s, p) => s + Number(p.capital_amount), 0)
  const pendingCapital = Math.max(0, totalCapital - recoveredCapital)
  const generatedInterest = loans.reduce((s, l) => s + Number(l.total_interest), 0)
  const todayTotal = todayPayments.reduce((s, p) => s + Number(p.amount), 0)
  const overdueTotal = overdueInstallments.reduce((s, i) => s + Number(i.amount), 0)
  const activeClients = clients.filter(c => c.status === 'active').length
  const lateClientIds = new Set(lateLoans.map(l => l.client_id))

  const monthlyData = useMemo(() => {
    const monthMap: Record<string, { income: number; loans: number }> = {}

    payments.forEach(p => {
      const month = p.payment_date.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { income: 0, loans: 0 }
      monthMap[month].income += Number(p.amount)
    })

    loans.forEach(l => {
      const month = l.created_at?.slice(0, 7)
      if (!month) return
      if (!monthMap[month]) monthMap[month] = { income: 0, loans: 0 }
      monthMap[month].loans += Number(l.amount)
    })

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleString('es-MX', { month: 'short' }),
        income: data.income,
        loans: data.loans,
      }))
  }, [payments, loans])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumen de tu cartera de préstamos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Capital Prestado" value={formatNumber(totalCapital)} icon={Wallet} />
        <StatCard label="Capital Recuperado" value={formatNumber(recoveredCapital)} icon={PiggyBank} />
        <StatCard label="Capital Pendiente" value={formatNumber(pendingCapital)} icon={CurrencyDollar} />
        <StatCard label="Intereses Generados" value={formatNumber(generatedInterest)} icon={TrendUp} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
            <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{activeClients}</p>
            <p className="text-xs text-muted-foreground">Clientes activos</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
            <Warning className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{lateClientIds.size}</p>
            <p className="text-xs text-muted-foreground">Clientes morosos</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
            <Calendar className="h-4 w-4 md:h-5 md:w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{formatNumber(todayTotal)}</p>
            <p className="text-xs text-muted-foreground">Cobros del día</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
            <Warning className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{formatNumber(overdueTotal)}</p>
            <p className="text-xs text-muted-foreground">Cobros vencidos</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Próximos pagos</h3>
            <Link href="/collections" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todo <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {upcomingInstallments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay pagos próximos</p>
            ) : (
              upcomingInstallments.map(inst => (
                <div key={inst.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                  <Avatar name={inst.loan?.client?.name || '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{inst.loan?.client?.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(inst.due_date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(inst.amount)}</p>
                    <Badge variant="active">Pendiente</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
