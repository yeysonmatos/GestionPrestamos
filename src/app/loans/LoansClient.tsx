'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { Progress } from '@/components/ui/Progress'
import { formatCurrency, formatDate, getStatusLabel } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Phone, Calendar, SquaresFour, Table, CaretDown, ArrowsClockwise } from '@phosphor-icons/react'
import ActionSheet from '@/components/ui/ActionSheet'
import { useRouter } from 'next/navigation'
import type { Loan } from '@/types'

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

export default function LoansClient({ loans: initialLoans }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [freqFilter, setFreqFilter] = useState<string>('all')
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showTypeSheet, setShowTypeSheet] = useState(false)
  const [showFreqSheet, setShowFreqSheet] = useState(false)
  const [view, setView] = useState<ViewMode>('cards')
  const [loans] = useState(initialLoans)

  const isLateStatus = (s: string) => ['late', 'late_1_30', 'late_31_60', 'late_61_90'].includes(s)

  const filtered = loans.filter(l => {
    const q = search.toLowerCase()
    const matchesSearch = !search || l.client?.name?.toLowerCase().includes(q) || l.loan_id?.toLowerCase().includes(q) || l.client?.phone?.includes(q)
    const matchesFilter = filter === 'all' || l.status === filter || (filter === 'late' && isLateStatus(l.status))
    const matchesType = typeFilter === 'all' || l.amortization_type === typeFilter
    const matchesFreq = freqFilter === 'all' || l.frequency === freqFilter
    return matchesSearch && matchesFilter && matchesType && matchesFreq
  })

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

  const tabs = [
    { key: 'all', label: 'Todos', count: loans.length },
    { key: 'active', label: 'Activos', count: activeCount },
    { key: 'late', label: 'Atrasados', count: lateCount },
    { key: 'paid', label: 'Pagados', count: paidCount },
    { key: 'cancelled', label: 'Cancelados', count: cancelledCount },
  ]

  function openPayment(loan: Loan) {
    const url = `/loans/${loan.id}`
    window.location.href = url
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

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por cliente, ID o teléfono..." className="flex-1" />
        
        {/* Filtros unificados - igual que Clients */}
        <button onClick={() => setShowFilterSheet(true)}
          className="w-full sm:hidden flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm bg-card min-h-11">
          <span className="font-medium">
            {filter === 'all' ? 'Todos' : filter === 'active' ? 'Activos' : filter === 'late' ? 'Atrasados' : filter === 'paid' ? 'Pagados' : 'Cancelados'}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">({tabs.find(t => t.key === filter)?.count || 0})</span>
            <CaretDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
        
        <ActionSheet open={showFilterSheet} onClose={() => setShowFilterSheet(false)}
          options={[
            { key: 'all', label: 'Todos', count: tabs.find(t => t.key === 'all')?.count || 0 },
            { key: 'active', label: 'Activos', count: tabs.find(t => t.key === 'active')?.count || 0 },
            { key: 'late', label: 'Atrasados', count: tabs.find(t => t.key === 'late')?.count || 0 },
            { key: 'paid', label: 'Pagados', count: tabs.find(t => t.key === 'paid')?.count || 0 },
            { key: 'cancelled', label: 'Cancelados', count: tabs.find(t => t.key === 'cancelled')?.count || 0 },
          ]} selected={filter} onSelect={v => setFilter(v as any)} title="Filtrar préstamos" />
        
        <div className="hidden sm:flex items-center gap-2">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-border'
                }`}
              >
                {tab.label} <span className="text-xs opacity-70">({tab.count})</span>
              </button>
            ))}
          </div>
          
          <div className="flex gap-2 ml-4 hidden sm:block">
            <Button variant="secondary" size="sm" onClick={() => setShowTypeSheet(true)} className="gap-1 px-2 py-2 text-xs font-medium">
              <SquaresFour className="h-3.5 w-3.5" /> {typeFilter === 'all' ? 'Tipo' : typeFilter === 'french' ? 'Fra' : 'Int'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowFreqSheet(true)} className="gap-1 px-2 py-2 text-xs font-medium">
              <Calendar className="h-3.5 w-3.5" /> {freqFilter === 'all' ? 'Fre' : freqFilter === 'daily' ? 'Dia' : freqFilter === 'weekly' ? 'Sem' : freqFilter === 'biweekly' ? 'Qui' : 'Mes'}
            </Button>
          </div>
          
          <ActionSheet open={showTypeSheet} onClose={() => setShowTypeSheet(false)}
            options={[{ key: 'all', label: 'Todos' }, { key: 'french', label: 'Francesa' }, { key: 'interest_only', label: 'Interés' }]}
            selected={typeFilter} onSelect={setTypeFilter} title="Tipo de amortización" />
          <ActionSheet open={showFreqSheet} onClose={() => setShowFreqSheet(false)}
            options={[{ key: 'all', label: 'Todas' }, { key: 'daily', label: 'Diario' }, { key: 'weekly', label: 'Semanal' }, { key: 'biweekly', label: 'Quincenal' }, { key: 'monthly', label: 'Mensual' }]}
            selected={freqFilter} onSelect={setFreqFilter} title="Frecuencia" />
        </div>
        
        <div className="sm:hidden flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setShowTypeSheet(true)} className="flex-1 gap-1 px-2 py-2 text-xs font-medium rounded-lg bg-muted text-muted-foreground min-h-11">
            <SquaresFour className="h-3.5 w-3.5" /> {typeFilter === 'all' ? 'Tipo' : typeFilter === 'french' ? 'Fra' : 'Int'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowFreqSheet(true)} className="flex-1 gap-1 px-2 py-2 text-xs font-medium rounded-lg bg-muted text-muted-foreground min-h-11">
            <Calendar className="h-3.5 w-3.5" /> {freqFilter === 'all' ? 'Fre' : freqFilter === 'daily' ? 'Dia' : freqFilter === 'weekly' ? 'Sem' : freqFilter === 'biweekly' ? 'Qui' : 'Mes'}
          </Button>
        </div>
        
        <div className="flex border border-border rounded-lg overflow-hidden flex-shrink-0">
          <button onClick={() => setView('cards')} className={`p-2 transition-colors ${view === 'cards' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title="Vista tarjetas">
            <SquaresFour className="h-4 w-4" />
          </button>
          <button onClick={() => setView('table')} className={`p-2 transition-colors ${view === 'table' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`} title="Vista tabla">
            <Table className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search || typeFilter !== 'all' || freqFilter !== 'all' ? 'Sin resultados' : 'No hay préstamos'}
          description={search || typeFilter !== 'all' || freqFilter !== 'all' ? 'Intenta con otros filtros o términos de búsqueda' : 'Crea tu primer préstamo para empezar.'}
          icon={<span className="text-2xl">{search || typeFilter !== 'all' || freqFilter !== 'all' ? '🔍' : '💰'}</span>}
          action={!search && typeFilter === 'all' && freqFilter === 'all' ? (
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
            const avatarColor = avatarColors[loan.status] || avatarColors.default
            const statusColor = statusColors[loan.status] || statusColors.default
            const clientInitial = loan.client?.name?.charAt(0)?.toUpperCase() || '?'

            return (
              <Link key={loan.id} href={`/loans/${loan.id}`}>
                <Card className="relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer pl-0">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColor}`} />
                  <div className="flex items-center gap-3 py-3 pl-4 pr-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${avatarColor}`}>
                      {clientInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{loan.client?.name || 'Eliminado'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{loan.loan_id}</span>
                        <Badge variant={isLate ? 'late' : loan.status as any}>{getStatusLabel(loan.status)}</Badge>
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
                          <span className="flex items-center gap-1">
                            📆 {nextDue}
                          </span>
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
                      {isLate && (
                        <p className="text-xs text-destructive font-medium mt-1">{lateDays}d atrasado</p>
                      )}
                      {loan.remaining_amount > 0 && !isLate && (
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
                    <td className="py-3 px-3 text-xs text-muted-foreground hidden sm:table-cell">{nextDue || '—'}</td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={isLate ? 'late' : loan.status as any}>{getStatusLabel(loan.status)}</Badge>
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
