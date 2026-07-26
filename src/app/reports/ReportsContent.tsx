'use client'

import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import PageHeader from '@/components/ui/PageHeader'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import {
  TrendUp, CurrencyDollar, Users, Handshake, Percent,
} from '@phosphor-icons/react'
import type { Loan, Payment, Client } from '@/types'

const ReportsBarChart = dynamic(() => import('./ReportsCharts').then(m => m.ReportsBarChart), { ssr: false })
const ReportsPieChart = dynamic(() => import('./ReportsCharts').then(m => m.ReportsPieChart), { ssr: false })

interface Props {
  loans: Loan[]
  payments: Payment[]
  clients: Client[]
  initialPeriod?: string
}

export default function ReportsContent({ loans, payments, clients, initialPeriod = 'all' }: Props) {
  const router = useRouter()
  const period = initialPeriod as 'all' | 'month' | 'quarter' | 'year'

  const stats = useMemo(() => {
    const activeLoansList = loans.filter(l => l.status === 'active' || l.status === 'late')
    const paidLoansList = loans.filter(l => l.status === 'paid')
    const lateLoansList = loans.filter(l => l.status === 'late')

    const totalCapital = loans.reduce((s, l) => s + Number(l.amount), 0)
    const pendingCapital = activeLoansList.reduce((s, l) => s + Number(l.remaining_amount), 0)
    const recoveredCapital = Math.max(0, totalCapital - pendingCapital)
    const generatedInterest = loans.reduce((s, l) => s + Number(l.total_interest), 0)
    const collectedInterest = payments.reduce((s, p) => s + Number(p.interest_amount), 0)
    const activeClients = clients.filter(c => c.status === 'active').length
    const lateClientIds = new Set(lateLoansList.map(l => l.client_id))

    const activeCapital = loans
      .filter(l => l.status === 'active')
      .reduce((s, l) => s + Number(l.remaining_amount), 0)
    const lateCapital = loans
      .filter(l => l.status === 'late')
      .reduce((s, l) => s + Number(l.remaining_amount), 0)
    const totalAtRisk = activeCapital + lateCapital
    const portfolioHealth = totalAtRisk > 0
      ? Math.round((activeCapital / totalAtRisk) * 100)
      : 100

    return {
      totalCapital, recoveredCapital, pendingCapital,
      generatedInterest, collectedInterest,
      activeLoans: activeLoansList.length,
      paidLoans: paidLoansList.length,
      lateLoans: lateLoansList.length,
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

    loans.filter(l => l.created_at).forEach(l => {
      const month = l.created_at!.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { income: 0, loans: 0 }
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'Todo' },
          { key: 'month', label: 'Este mes' },
          { key: 'quarter', label: 'Último trimestre' },
          { key: 'year', label: 'Este año' },
        ].map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => router.push(`/reports?period=${opt.key}`)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              period === opt.key
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-border'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
            <Handshake className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{stats.activeLoans}</p>
            <p className="text-xs text-muted-foreground">Préstamos activos</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
            <CurrencyDollar className="h-4 w-4 md:h-5 md:w-5 text-success" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{formatNumber(stats.recoveredCapital)}</p>
            <p className="text-xs text-muted-foreground">Capital recuperado</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
            <TrendUp className="h-4 w-4 md:h-5 md:w-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-xl font-bold text-foreground">{formatNumber(stats.collectedInterest)}</p>
            <p className="text-xs text-muted-foreground">Intereses cobrados</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 sm:gap-4">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border">
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
            <ReportsBarChart data={monthlyData} />
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Estado de préstamos</h3>
          <div className="h-72">
            <ReportsPieChart data={statusData} />
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
