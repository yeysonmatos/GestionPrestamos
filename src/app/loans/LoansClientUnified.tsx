'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { Progress } from '@/components/ui/Progress'
import { formatCurrency, formatDate, getStatusLabel } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Phone, Calendar, SquaresFour, Table, ArrowsClockwise } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import type { Loan } from '@/types'
import { LoanFilters } from '@/components/loans/LoanFilters'

interface Props {
  loans: Loan[]
}

type ViewMode = 'cards' | 'table'

const statusColors: Record<string, string> = {
  active: 'bg-blue-500',
  paid: 'bg-green-500',
  late: 'bg-red-500',
  late_1_30: 'bg-red-500',
  late_31_60: 'bg-red-500',
  late_61_90: 'bg-red-500',
  cancelled: 'bg-gray-400',
  default: 'bg-gray-300',
}

const avatarColors: Record<string, string> = {
  active: 'bg-blue-500',
  paid: 'bg-green-600',
  late: 'bg-red-500',
  late_1_30: 'bg-red-500',
  late_31_60: 'bg-red-500',
  late_61_90: 'bg-red-500',
  cancelled: 'bg-gray-400',
  default: 'bg-gray-400',
}

export default function LoansClientUnified({ loans: initialLoans }: Props) {
  const router = useRouter()
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [loans] = useState(initialLoans)

  // Unified filter state matching LoanFilters
  const [filters, setFilters] = useState({
    search: '',
    status: 'all' as string,
    type: 'all' as string,
    frequency: 'all' as string,
    dateRange: { from: '', to: '' },
    amountRange: { min: '', max: '' },
    showFilters: false,
  })

  const isLateStatus = (s: string) => ['late', 'late_1_30', 'late_31_60', 'late_61_90'].includes(s)

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase()
    return loans.filter(l => {
      const matchesSearch = !q || l.client?.name?.toLowerCase().includes(q) || l.loan_id?.toLowerCase().includes(q) || l.client?.phone?.includes(q)
      const matchesStatus = filters.status === 'all' || l.status === filters.status || (filters.status === 'late' && isLateStatus(l.status))
      const matchesType = filters.type === 'all' || l.amortization_type === filters.type
      const matchesFreq = filters.frequency === 'all' || l.frequency === filters.frequency
      const matchesDateFrom = !filters.dateRange.from || (l.first_payment_date && l.first_payment_date >= filters.dateRange.from)
      const matchesDateTo = !filters.dateRange.to || (l.first_payment_date && l.first_payment_date <= filters.dateRange.to)
      const matchesAmountMin = !filters.amountRange.min || Number(l.amount) >= Number(filters.amountRange.min)
      const matchesAmountMax = !filters.amountRange.max || Number(l.amount) <= Number(filters.amountRange.max)
      return matchesSearch && matchesStatus && matchesType && matchesFreq && matchesDateFrom && matchesDateTo && matchesAmountMin && matchesAmountMax
    })
  }, [loans, filters])

  function getLateDays(loan: Loan): number {
    if (!loan.late_days) return 0
    if (loan.status === 'late_1_30') return Math.min(loan.late_days, 30)
    if (loan.status === 'late_31_60') return Math.min(loan.late_days, 60)
    if (loan.status === 'late_61_90') return loan.late_days
    return 0
  }

  const pendingCount = loans.filter(l => l.status === 'active' || isLateStatus(l.status)).length
  const activeCount = loans.filter(l => l.status === 'active').length
  const lateCount = loans.filter(l => isLateStatus(l.status)).length
  const paidCount = loans.filter(l => l.status === 'paid').length
  const cancelledCount = loans.filter(l => l.status === 'cancelled').length

  const statusTabs = [
    { key: 'all', label: 'Todos', count: loans.length },
    { key: 'active', label: 'Activos', count: activeCount },
    { key: 'late', label: 'Atrasados', count: lateCount },
    { key: 'paid', label: 'Pagados', count: paidCount },
    { key: 'cancelled', label: 'Cancelados', count: cancelledCount },
  ]

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    loans.forEach(l => {
      counts[l.status] = (counts[l.status] || 0) + 1
    })
    return counts
  }, [loans])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    loans.forEach(l => {
      const t = l.amortization_type || 'french'
      counts[t] = (counts[t] || 0) + 1
    })
    return counts
  }, [loans])

  const freqCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    loans.forEach(l => {
      counts[l.frequency] = (counts[l.frequency] || 0) + 1
    })
    return counts
  }, [loans])

  const counts = useMemo(() => ({
    status: statusCounts,
    type: typeCounts,
    frequency: freqCounts,
  }), [statusCounts, typeCounts, freqCounts])

  const handleFilterChange = (key: string, value: string | { min: string; max: string } | { from: string; to: string }) => {
    setFilters(prev => {
      if (key === 'amountRange' && typeof value === 'object' && 'min' in value) {
        return { ...prev, amountRange: value }
      }
      if (key === 'dateRange' && typeof value === 'object' && 'from' in value) {
        return { ...prev, dateRange: value }
      }
      return { ...prev, [key]: value }
    })
  }

  const filterActions = {
    setSearch: (v: string) => setFilters(p => ({ ...p, search: v })),
    setStatus: (v: string) => setFilters(p => ({ ...p, status: v })),
    setType: (v: string) => setFilters(p => ({ ...p, type: v })),
    setFrequency: (v: string) => setFilters(p => ({ ...p, frequency: v })),
    setDateFrom: (v: string) => setFilters(p => ({ ...p, dateRange: { ...p.dateRange, from: v } })),
    setDateTo: (v: string) => setFilters(p => ({ ...p, dateRange: { ...p.dateRange, to: v } })),
    setAmountMin: (v: string) => setFilters(p => ({ ...p, amountRange: { ...p.amountRange, min: v } })),
    setAmountMax: (v: string) => setFilters(p => ({ ...p, amountRange: { ...p.amountRange, max: v } })),
    setAmountRange: (v: { min: string; max: string }) => setFilters(p => ({ ...p, amountRange: v })),
    setShowFilters: (v: boolean) => setFilters(p => ({ ...p, showFilters: v })),
    clearAll: () => setFilters({
      search: '', status: 'all', type: 'all', frequency: 'all',
      dateRange: { from: '', to: '' },
      amountRange: { min: '', max: '' },
      showFilters: false,
    }),
    clearStatus: () => setFilters(p => ({ ...p, status: 'all' })),
    clearDateRange: () => setFilters(p => ({ ...p, dateRange: { from: '', to: '' } })),
    clearAmountRange: () => setFilters(p => ({ ...p, amountRange: { min: '', max: '' } })),
  }

  function calcNextDue(loan: Loan): string | null {
    if (!loan.first_payment_date) return null
    const paid = loan.paid_installments || 0
    const freq = loan.frequency
    const d = new Date(loan.first_payment_date)
    if (freq === 'daily') d.setDate(d.getDate() + paid)
    else if (freq === 'weekly') d.setDate(d.getDate() + paid * 7)
    else if (freq === 'biweekly') d.setDate(d.getDate() + paid * 14)
    else if (freq === 'monthly') d.setMonth(d.getMonth() + paid)
    return d > new Date() ? formatDate(d.toISOString()) : null
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Préstamos"
        description="Gestiona los préstamos activos y su plan de pagos"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.refresh()} className="min-h-11 min-w-11 p-0 flex items-center justify-center">
              <ArrowsClockwise className="h-4 w-4" />
            </Button>
            <Link href="/loans/new">
              <Button><Plus className="h-4 w-4 mr-1" /> Nuevo préstamo</Button>
            </Link>
          </div>
        }
      />

      <LoanFilters
        state={filters}
        actions={{
          setSearch: filterActions.setSearch,
          setStatus: filterActions.setStatus,
          setType: filterActions.setType,
          setFrequency: filterActions.setFrequency,
          setDateFrom: filterActions.setDateFrom,
          setDateTo: filterActions.setDateTo,
          setAmountMin: filterActions.setAmountMin,
          setAmountMax: filterActions.setAmountMax,
          setAmountRange: filterActions.setAmountRange,
          setShowFilters: filterActions.setShowFilters,
          clearAll: filterActions.clearAll,
          clearStatus: filterActions.clearStatus,
          clearDateRange: filterActions.clearDateRange,
          clearAmountRange: filterActions.clearAmountRange,
        }}
        counts={counts}
        viewToggle={
          <div className="flex border border-border rounded-lg overflow-hidden flex-shrink-0">
            <button onClick={() => setView('cards')} className={`p-2 transition-colors ${view === 'cards' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title="Vista tarjetas">
              <SquaresFour className="h-4 w-4" />
            </button>
            <button onClick={() => setView('table')} className={`p-2 transition-colors ${view === 'table' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title="Vista tabla">
              <Table className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={filters.search || filters.status !== 'all' || filters.type !== 'all' || filters.frequency !== 'all' ? 'Sin resultados' : 'No hay préstamos'}
          description={filters.search || filters.status !== 'all' || filters.type !== 'all' || filters.frequency !== 'all' ? 'Intenta con otros filtros o términos de búsqueda' : 'Crea tu primer préstamo para empezar.'}
          icon={<span className="text-2xl">{filters.search || filters.status !== 'all' || filters.type !== 'all' || filters.frequency !== 'all' ? '🔍' : '💰'}</span>}
          action={!filters.search && filters.status === 'all' && filters.type === 'all' && filters.frequency === 'all' ? (
            <Link href="/loans/new"><Button><Plus className="h-4 w-4 mr-1" /> Nuevo préstamo</Button></Link>
          ) : undefined}
        />
      ) : view === 'cards' ? (
        <div className="space-y-2">
          {filtered.map(loan => {
            const nextDue = calcNextDue(loan)
            const isLate = isLateStatus(loan.status)
            const lateDays = getLateDays(loan)
            const paidCount = loan.paid_installments || 0
            const totalInst = loan.installments || 0
            const progress = loan.open_ended
              ? Math.round(((Number(loan.amount) - Number(loan.remaining_amount)) / Number(loan.amount)) * 100)
              : loan.progress || 0
            const avatarColor = ['bg-blue-500', 'bg-green-600', 'bg-red-500', 'bg-gray-400'][['active','paid','late','cancelled'].indexOf(loan.status)] || 'bg-gray-400'
            const statusColor = ['bg-blue-500', 'bg-green-500', 'bg-red-500', 'bg-gray-400'][['active','paid','late','cancelled'].indexOf(loan.status)] || 'bg-gray-300'
            const clientInitial = loan.client?.name?.charAt(0)?.toUpperCase() || '?'

            return (
              <Link key={loan.id} href={`/loans/${loan.id}`}>
                <Card className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer pl-0">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColor}`} />
                  <div className="flex items-center gap-3 py-3 pl-4 pr-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${['bg-blue-500','bg-green-600','bg-red-500','bg-gray-400'][['active','paid','late','cancelled'].indexOf(loan.status)] || 'bg-gray-400'}`}>
                      {clientInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{loan.client?.name || 'Eliminado'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{loan.loan_id}</span>
                        <Badge variant={isLateStatus(loan.status) ? 'late' : loan.status as any}>{getStatusLabel(loan.status)}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {loan.client?.phone && (
                          <span className="flex items-center gap-1 text-primary">
                            <Phone className="h-3 w-3" /> {loan.client.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(loan.start_date)}
                        </span>
                        {nextDue && (
                          <span className="flex items-center gap-1">📆 {nextDue}</span>
                        )}
                        <span>{loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}</span>
                        <span>{loan.amortization_type === 'interest_only' ? 'Interés' : 'Francesa'}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 min-w-[100px]">
                      <p className="font-bold text-foreground">{formatCurrency(loan.amount)}</p>
                      {!loan.open_ended && totalInst > 0 && (
                        <div className="flex items-center gap-2 mt-1 justify-end">
                          <Progress value={progress} className="w-16 h-1.5" />
                          <span className="text-xs text-muted-foreground">{paidCount}/{totalInst}</span>
                        </div>
                      )}
                      {loan.open_ended && (
                        <div className="flex items-center gap-2 mt-1 justify-end">
                          <Progress value={progress} className="w-16 h-1.5" />
                          <span className="text-xs text-muted-foreground">{progress}%</span>
                        </div>
                      )}
                      {isLateStatus(loan.status) && (
                        <p className="text-xs text-destructive font-medium mt-1">{getLateDays(loan)}d atrasado</p>
                      )}
                      {loan.remaining_amount > 0 && !isLateStatus(loan.status) && (
                        <p className="text-xs text-muted-foreground mt-1">Resta: {formatCurrency(loan.remaining_amount)}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs">Cliente</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs">ID</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs">Monto</th>
                <th className="text-right py-3 px-3 font-medium text-muted-foreground text-xs">Progreso</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Frecuencia</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs hidden md:table-cell">Teléfono</th>
                <th className="text-left py-3 px-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Vence</th>
                <th className="text-center py-3 px-3 font-medium text-muted-foreground text-xs">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(loan => {
                const nextDue = calcNextDue(loan)
                const isLate = isLateStatus(loan.status)
                return (
                  <tr key={loan.id} className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = `/loans/${loan.id}`}>
                    <td className="py-3 px-3 font-medium text-foreground">{loan.client?.name || 'Eliminado'}</td>
                    <td className="py-3 px-3 text-muted-foreground text-xs">{loan.loan_id}</td>
                    <td className="py-3 px-3 text-right font-semibold">{formatCurrency(loan.amount)}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Progress value={loan.progress || 0} className="w-16 h-1.5" />
                        <span className="text-xs text-muted-foreground">{loan.paid_installments || 0}/{loan.installments || 0}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-muted-foreground hidden sm:table-cell">
                      {loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}
                    </td>
                    <td className="py-3 px-3 text-xs text-primary hidden md:table-cell">{loan.client?.phone || '—'}</td>
                    <td className="py-3 px-3 text-xs text-muted-foreground hidden sm:table-cell">{calcNextDue(loan) || '—'}</td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={isLateStatus(loan.status) ? 'late' : loan.status as any}>{getStatusLabel(loan.status)}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}