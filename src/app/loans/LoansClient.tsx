'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { Progress } from '@/components/ui/Progress'
import { Avatar } from '@/components/ui/Avatar'
import { formatCurrency, formatDate, getStatusLabel } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Phone, Calendar } from 'lucide-react'
import type { Loan } from '@/types'

interface Props {
  loans: Loan[]
}

export default function LoansClient({ loans: initialLoans }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [freqFilter, setFreqFilter] = useState<string>('all')
  const [loans] = useState(initialLoans)

  const filtered = loans.filter(l => {
    const matchesSearch = !search || l.client?.name?.toLowerCase().includes(search.toLowerCase()) || l.loan_id?.includes(search) || l.client?.phone?.includes(search)
    const matchesFilter = filter === 'all' || l.status === filter || (filter === 'late' && ['late','late_1_30','late_31_60','late_61_90'].includes(l.status))
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

  const tabs = [
    { key: 'all', label: 'Todos', count: loans.length },
    { key: 'active', label: 'Activos', count: loans.filter(l => l.status === 'active').length },
    { key: 'paid', label: 'Pagados', count: loans.filter(l => l.status === 'paid').length },
    { key: 'late', label: 'Atrasados', count: loans.filter(l => ['late','late_1_30','late_31_60','late_61_90'].includes(l.status)).length },
    { key: 'late_1_30', label: '1-30d', count: loans.filter(l => l.status === 'late_1_30').length },
    { key: 'late_31_60', label: '31-60d', count: loans.filter(l => l.status === 'late_31_60').length },
    { key: 'late_61_90', label: '61-90d', count: loans.filter(l => l.status === 'late_61_90').length },
    { key: 'cancelled', label: 'Cancelados', count: loans.filter(l => l.status === 'cancelled').length },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Préstamos"
        description="Gestiona los préstamos activos y su plan de pagos"
        action={
          <Link href="/loans/new">
            <Button><Plus className="h-4 w-4 mr-1" /> Nuevo préstamo</Button>
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por cliente, ID o teléfono..." className="flex-1" />
        <div className="flex gap-1 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === tab.key
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-border'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground">
          <option value="all">Todos</option>
          <option value="interest_only">Solo interés</option>
          <option value="french">Francesa</option>
        </select>
        <select value={freqFilter} onChange={e => setFreqFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground">
          <option value="all">Todas frecuencias</option>
          <option value="daily">Diario</option>
          <option value="weekly">Semanal</option>
          <option value="biweekly">Quincenal</option>
          <option value="monthly">Mensual</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No hay préstamos" description="Crea tu primer préstamo para empezar."
          icon={<span className="text-2xl">💰</span>}
          action={<Link href="/loans/new"><Button><Plus className="h-4 w-4 mr-1" /> Nuevo préstamo</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(loan => {
            const nextDue = calcNextDue(loan)
            return (
              <Link key={loan.id} href={`/loans/${loan.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={loan.client?.name || '?'} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground truncate">{loan.client?.name || 'Eliminado'}</p>
                          <Badge variant={loan.status as any}>{getStatusLabel(loan.status)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{loan.loan_id} · {formatDate(loan.start_date)}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {loan.client?.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {loan.client.phone}
                            </span>
                          )}
                          <span>{loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}</span>
                          <span>{loan.amortization_type === 'interest_only' ? 'Solo interés' : 'Francesa'}</span>
                          {nextDue && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {nextDue}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-foreground">{formatCurrency(loan.amount)}</p>
                      <div className="flex items-center gap-2 mt-1 justify-end">
                        <Progress value={loan.progress} className="w-20 h-2" />
                        <span className="text-xs text-muted-foreground">
                          {loan.open_ended
                            ? `${formatCurrency(Number(loan.amount) - Number(loan.remaining_amount))}/${formatCurrency(loan.amount)}`
                            : `${loan.paid_installments}/${loan.installments}`}
                        </span>
                      </div>
                      {loan.remaining_amount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Resta: {formatCurrency(loan.remaining_amount)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
