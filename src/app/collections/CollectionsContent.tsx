'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import Input from '@/components/ui/Input'
import BottomSheet from '@/components/ui/BottomSheet'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import { calculateLateDays, calculateLateAmount } from '@/lib/calculations'
import { processInstallmentPayment, updateLoanAfterPayment } from '@/lib/payments'
import { useRouter } from 'next/navigation'
import {
  CalendarCheck, Warning, Calendar, CurrencyDollar, Plus, CaretDown, ArrowsClockwise,
} from '@phosphor-icons/react'
import ActionSheet from '@/components/ui/ActionSheet'
import type { Installment, Payment, Client, Setting } from '@/types'

interface OpenEndedLoan {
  id: string
  loan_id: string
  amount: number
  installment_amount: number
  remaining_amount: number
  payment_day: number
  first_payment_date: string
  client: { id: string; name: string; phone: string | null } | null
}

interface SyntheticInstallment {
  id: string
  loan_id: string
  client_id: string
  number: number
  amount: number
  capital: number
  interest: number
  balance: number
  paid_amount: number
  paid_late_amount: number
  due_date: string
  paid_at: string | null
  status: 'pending' | 'paid' | 'late'
  late_days: number
  late_amount: number
  loan: { loan_id: string; client: Client | null; amortization_type?: string; total_amount?: number; remaining_amount?: number }
  isOpenEnded: true
  openEndedLoan: OpenEndedLoan
}

function getNextDueDate(loan: OpenEndedLoan): string {
  const d = new Date(loan.first_payment_date)
  d.setDate(loan.payment_day || 1)
  const now = new Date()
  while (d <= now) {
    d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString().split('T')[0]
}

interface ActiveLoanBrief {
  id: string
  loan_id: string
  amount: number
  remaining_amount: number
  installment_amount: number
  amortization_type: string
  open_ended: boolean
  client: { id: string; name: string; phone: string | null; whatsapp: string | null } | null
}

interface Props {
  todayInstallments: Installment[]
  overdueInstallments: Installment[]
  upcomingInstallments: Installment[]
  recentPayments: Payment[]
  openEndedLoans: OpenEndedLoan[]
  settings: Setting | null
  activeLoans: ActiveLoanBrief[]
}

export default function CollectionsContent({
  todayInstallments: initialToday, overdueInstallments: initialOverdue, upcomingInstallments: initialUpcoming, recentPayments: initialPayments, openEndedLoans, settings, activeLoans,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | SyntheticInstallment | null>(null)
  const [showQuickPayment, setShowQuickPayment] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientLoan, setSelectedClientLoan] = useState<string | null>(null)
  const [qpAmount, setQpAmount] = useState('')
  const [qpMethod, setQpMethod] = useState('cash')
  const [qpDate, setQpDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [qpNotes, setQpNotes] = useState('')
  const [qpLoading, setQpLoading] = useState(false)
  const [qpError, setQpError] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [filter, setFilter] = useState<'today' | 'overdue' | 'upcoming' | 'history'>('today')
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [includeMora, setIncludeMora] = useState(true)
  const [installmentMora, setInstallmentMora] = useState<{ lateDays: number; lateAmount: number } | null>(null)
  const [todayInstallments, setTodayInstallments] = useState(initialToday)
  const [overdueInstallments, setOverdueInstallments] = useState(initialOverdue)
  const [upcomingInstallments, setUpcomingInstallments] = useState(initialUpcoming)
  const [payments, setPayments] = useState(initialPayments)

  const lateInterestRate = settings?.late_interest_rate || 0.5
  const graceDays = settings?.grace_days || 0

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  const synthetic = useMemo(() => {
    const today: SyntheticInstallment[] = []
    const overdue: SyntheticInstallment[] = []
    const upcoming: SyntheticInstallment[] = []

    const now = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

    openEndedLoans.forEach(loan => {
      const due = getNextDueDate(loan)
      const entry: SyntheticInstallment = {
        id: `open_${loan.id}`,
        loan_id: loan.id,
        client_id: loan.client?.id || '',
        number: 0,
        amount: loan.installment_amount,
        capital: 0,
        interest: loan.installment_amount,
        balance: loan.remaining_amount,
        paid_amount: 0,
        paid_late_amount: 0,
        due_date: due,
        paid_at: null,
        status: 'pending',
        late_days: 0,
        late_amount: 0,
        loan: { loan_id: loan.loan_id, client: loan.client ? { id: loan.client.id, name: loan.client.name, phone: loan.client.phone ?? null } : null } as SyntheticInstallment['loan'],
        isOpenEnded: true,
        openEndedLoan: loan,
      }

      if (due === now) today.push(entry)
      else if (due < now) overdue.push(entry)
      else upcoming.push(entry)
    })

    return { today, overdue, upcoming }
  }, [openEndedLoans])

  const allToday = useMemo(() => [...todayInstallments, ...synthetic.today], [todayInstallments, synthetic.today])
  const allOverdue = useMemo(() => [...overdueInstallments, ...synthetic.overdue], [overdueInstallments, synthetic.overdue])
  const allUpcoming = useMemo(() => [...upcomingInstallments, ...synthetic.upcoming], [upcomingInstallments, synthetic.upcoming])

  const enrichedOverdue = useMemo(() => {
    return allOverdue.map(inst => {
      const lateDays = calculateLateDays(inst.due_date, graceDays)
      const remaining = inst.amount - (inst.paid_amount || 0)
      const totalLate = calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, lateInterestRate)
      const paidLate = inst.paid_late_amount || 0
      const remainingLate = Math.max(0, totalLate - paidLate)
      return { ...inst, late_days: Math.max(inst.late_days, lateDays), late_amount: remainingLate }
    })
  }, [allOverdue, lateInterestRate])

  const handlePay = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedInstallment || !userId) return
    const inst = selectedInstallment
    const isOpenEndedType = 'isOpenEnded' in inst && inst.isOpenEnded

    if (isOpenEndedType) {
      setLoading(true)
      setPaymentError('')
      const amount = parseFloat(paymentAmount)
      if (isNaN(amount) || amount <= 0) { setPaymentError('Monto inválido'); setLoading(false); return }

      const { data: payment, error } = await supabase
        .from('payments')
        .insert({
          loan_id: inst.loan_id,
          client_id: inst.client_id,
          user_id: userId,
          amount,
          capital_amount: 0,
          interest_amount: amount,
          payment_date: paymentDate,
          method: paymentMethod,
          notes: paymentNotes || null,
        })
        .select()
        .single()

      if (error) { setPaymentError('Error al registrar pago: ' + error.message); setLoading(false); return }

      if (payment) {
        const { data: loanData } = await supabase
          .from('loans')
          .select('paid_amount, remaining_amount')
          .eq('id', inst.loan_id)
          .single()

        if (loanData) {
          const newPaid = Number(loanData.paid_amount) + amount
          const newRemaining = Math.max(0, Number(loanData.remaining_amount))
          await supabase.from('loans').update({
            paid_amount: newPaid,
            remaining_amount: newRemaining,
          }).eq('id', inst.loan_id)
          await supabase.rpc('update_client_stats', { p_client_id: inst.client_id })
        }

        setPayments(prev => [payment, ...prev])
        setShowPayment(false)
        setSelectedInstallment(null)
        setPaymentAmount('')
        setInstallmentMora(null)
        router.refresh()
      }
      setLoading(false)
      return
    }

    setLoading(true)

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) { setLoading(false); return }

    const realInst = inst as Installment

    try {
      const loanForPayment = {
        id: inst.loan_id,
        client_id: inst.client_id,
        amortization_type: inst.loan?.amortization_type || 'french',
        amount: Number(inst.loan?.total_amount || 0),
        installments: 0,
        total_amount: Number(inst.loan?.total_amount || 0),
        remaining_amount: Number(inst.loan?.remaining_amount || 0),
      }
      const { payment, allocation } = await processInstallmentPayment(supabase as any, {
        loan: loanForPayment as any,
        installment: realInst,
        amount,
        includeMora,
        paymentDate,
        method: paymentMethod,
        notes: paymentNotes,
        userId,
        lateInterestRate,
        graceDays,
      })

      const loanUpdates = await updateLoanAfterPayment(supabase as any, inst.loan_id, inst.client_id)

      const newStatus = allocation.isNowFullyPaid ? 'paid' as const : allocation.totalPaidOnInstallment > 0 ? 'partial' as const : 'pending' as const
      const updatedInstallment: Installment = {
        ...realInst,
        status: newStatus,
        paid_amount: allocation.totalPaidOnInstallment,
        paid_late_amount: allocation.newPaidLateAmount,
        late_amount: allocation.totalLateAmount,
        late_days: allocation.lateDays,
        paid_at: allocation.isNowFullyPaid ? paymentDate : null,
      }

      setTodayInstallments(prev => prev.map(i => i.id === realInst.id ? updatedInstallment : i))
      setOverdueInstallments(prev => prev.map(i => i.id === realInst.id ? updatedInstallment : i))
      setUpcomingInstallments(prev => prev.map(i => i.id === realInst.id ? updatedInstallment : i))
      setPayments(prev => [payment, ...prev])

      setShowPayment(false)
      setSelectedInstallment(null)
      setPaymentAmount('')
      setInstallmentMora(null)
      router.refresh()
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Error al procesar el pago')
    }

    setLoading(false)
  }, [selectedInstallment, userId, paymentAmount, includeMora, paymentDate, paymentMethod, paymentNotes, lateInterestRate, graceDays, supabase, router])

  const todayTotal = useMemo(() => allToday.reduce((s, i) => s + Number(i.amount), 0), [allToday])
  const overdueTotal = useMemo(() => enrichedOverdue.reduce((s, i) => s + Number(i.amount), 0), [enrichedOverdue])
  const upcomingTotal = useMemo(() => allUpcoming.reduce((s, i) => s + Number(i.amount), 0), [allUpcoming])

  const groupedByClient = useMemo(() => {
    const map = new Map<string, { client: NonNullable<ActiveLoanBrief['client']>; loans: ActiveLoanBrief[] }>()
    for (const loan of activeLoans) {
      if (!loan.client) continue
      const existing = map.get(loan.client.id)
      if (existing) {
        existing.loans.push(loan)
      } else {
        map.set(loan.client.id, { client: loan.client, loans: [loan] })
      }
    }
    return Array.from(map.values())
  }, [activeLoans])

  const filteredClients = useMemo(() => {
    if (!clientSearch) return groupedByClient
    const q = clientSearch.toLowerCase()
    return groupedByClient.filter(g =>
      g.client.name.toLowerCase().includes(q) ||
      g.client.phone?.includes(q)
    )
  }, [groupedByClient, clientSearch])

  const selectedLoan = useMemo(() => {
    if (!selectedClientLoan) return null
    return activeLoans.find(l => l.id === selectedClientLoan) || null
  }, [selectedClientLoan, activeLoans])

  async function handleQuickPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedClientLoan || !userId) return
    const loan = activeLoans.find(l => l.id === selectedClientLoan)
    if (!loan || !loan.client) return

    setQpLoading(true)
    setQpError('')

    const amount = parseFloat(qpAmount)
    if (isNaN(amount) || amount <= 0) { setQpError('Monto inválido'); setQpLoading(false); return }

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        loan_id: loan.id,
        client_id: loan.client.id,
        user_id: userId,
        amount,
        capital_amount: 0,
        interest_amount: amount,
        payment_date: qpDate,
        method: qpMethod,
        notes: qpNotes || null,
        type: 'capital_abono',
      })
      .select()
      .single()

    if (error) { setQpError('Error al registrar pago: ' + error.message); setQpLoading(false); return }

    const { data: loanData } = await supabase
      .from('loans')
      .select('paid_amount, remaining_amount')
      .eq('id', loan.id)
      .single()

    if (loanData) {
      const newPaid = Number(loanData.paid_amount) + amount
      const newRemaining = Math.max(0, Number(loanData.remaining_amount) - amount)
      await supabase.from('loans').update({
        paid_amount: newPaid,
        remaining_amount: newRemaining,
      }).eq('id', loan.id)
      await supabase.rpc('update_client_stats', { p_client_id: loan.client.id })
    }

    setPayments(prev => [payment, ...prev])
    setShowQuickPayment(false)
    setSelectedClientLoan(null)
    setQpAmount('')
    setQpNotes('')
    setClientSearch('')
    router.refresh()
    setQpLoading(false)
  }

  function openPayment(inst: Installment | SyntheticInstallment) {
    setSelectedInstallment(inst)
    const lateDays = calculateLateDays(inst.due_date, graceDays)
    const remaining = inst.amount - (inst.paid_amount || 0)
    const totalLate = lateDays > 0 ? calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, lateInterestRate) : 0
    const paidLate = ('paid_late_amount' in inst ? (inst.paid_late_amount || 0) : 0)
    const remainingLate = Math.max(0, totalLate - paidLate)
    const hasMora = remainingLate > 0
    setInstallmentMora(hasMora ? { lateDays, lateAmount: remainingLate } : null)
    setIncludeMora(hasMora)
    setPaymentAmount(String(hasMora ? remaining + remainingLate : remaining))
    setShowPayment(true)
  }

  const allList: (Installment | SyntheticInstallment)[] = filter === 'today' ? allToday
    : filter === 'overdue' ? enrichedOverdue
    : filter === 'upcoming' ? allUpcoming
    : []

  const filteredList: (Installment | SyntheticInstallment)[] = allList.filter(inst => {
    if (!search) return true
    const name = inst.loan?.client?.name?.toLowerCase() || ''
    return name.includes(search.toLowerCase())
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cobros"
        description="Gestiona los pagos y cobros diarios"
        action={<div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => router.refresh()} className="min-h-11 min-w-11 p-0 flex items-center justify-center"><ArrowsClockwise className="h-4 w-4" /></Button><Button onClick={() => setShowQuickPayment(true)}><Plus className="h-4 w-4 mr-1" /> Registrar cobro</Button></div>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-white border border-border flex items-center justify-center">
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(todayTotal)}</p>
            <p className="text-xs text-muted-foreground">Hoy ({allToday.length})</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-white border border-border flex items-center justify-center">
            <Warning className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(overdueTotal)}</p>
            <p className="text-xs text-muted-foreground">Vencidos ({enrichedOverdue.length})</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-white border border-border flex items-center justify-center">
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(upcomingTotal)}</p>
            <p className="text-xs text-muted-foreground">Próximos ({allUpcoming.length})</p>
          </div>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por cliente..." className="flex-1" />
        <button onClick={() => setShowFilterSheet(true)}
          className="w-full sm:hidden flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm bg-card min-h-11">
          <span className="font-medium">{({ today: 'Hoy', overdue: 'Vencidos', upcoming: 'Próximos', history: 'Historial' } as Record<string, string>)[filter]}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">({[allToday.length, enrichedOverdue.length, allUpcoming.length, payments.length][['today', 'overdue', 'upcoming', 'history'].indexOf(filter)]})</span>
            <CaretDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
        <ActionSheet open={showFilterSheet} onClose={() => setShowFilterSheet(false)}
          options={[
            { key: 'today', label: 'Hoy', count: allToday.length },
            { key: 'overdue', label: 'Vencidos', count: enrichedOverdue.length },
            { key: 'upcoming', label: 'Próximos', count: allUpcoming.length },
            { key: 'history', label: 'Historial', count: payments.length },
          ]} selected={filter} onSelect={v => setFilter(v as any)} title="Filtrar cobros" />
        <div className="hidden sm:flex gap-1">
          {([
            { key: 'today', label: 'Hoy', count: allToday.length },
            { key: 'overdue', label: 'Vencidos', count: enrichedOverdue.length },
            { key: 'upcoming', label: 'Próximos', count: allUpcoming.length },
            { key: 'history', label: 'Historial', count: payments.length },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
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

      {filter === 'history' ? (
        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Últimos cobros realizados</h3>
          {payments.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-2xl">📭</div>
              <p className="font-medium text-foreground">Sin cobros registrados</p>
              <p className="text-sm text-muted-foreground mt-1">Los cobros aparecerán aquí cuando se registren</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map(p => {
                const methodIcon = p.method === 'cash' ? '💰' : p.method === 'transfer' ? '🏦' : p.method === 'deposit' ? '📥' : '💳'
                const typeLabel = p.type === 'capital_abono' ? 'Abono' : p.type === 'liquidation' ? 'Liquidación' : p.type === 'installment' ? 'Interés' : 'Cuota'
                const typeColor = p.type === 'capital_abono' ? 'bg-purple-100 text-purple-700' : p.type === 'liquidation' ? 'bg-green-100 text-green-700' : p.type === 'installment' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 transition-all">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${
                      p.method === 'cash' ? 'bg-green-50' : p.method === 'transfer' ? 'bg-blue-50' : p.method === 'deposit' ? 'bg-amber-50' : 'bg-gray-50'
                    }`}>
                      {methodIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{p.loan?.client?.name || 'Eliminado'}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${typeColor}`}>{typeLabel}</span>
                        <span className="truncate">{p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : p.method === 'deposit' ? 'Depósito' : 'Otro'}{p.notes ? ` · ${p.notes}` : ''}</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-1">
                      <p className="font-semibold text-success text-sm">{formatCurrency(p.amount)}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(p.payment_date)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      ) : filteredList.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-2xl">
              {filter === 'today' ? '📅' : filter === 'overdue' ? '⚠️' : '📆'}
            </div>
            <p className="font-medium text-foreground">
              {filter === 'today' ? 'No hay cobros para hoy' : filter === 'overdue' ? 'No hay cuotas vencidas' : 'No hay cuotas próximas'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === 'today' ? 'Los cobros del día aparecerán aquí' : filter === 'overdue' ? 'Todo está al día' : 'No hay cuotas programadas'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredList.map((inst: Installment | SyntheticInstallment) => {
            const client = inst.loan?.client
            const isOpen = ('isOpenEnded' in inst && inst.isOpenEnded)
            const remainingLate = Math.max(0, (inst.late_amount || 0) - ((inst as Installment).paid_late_amount || 0))
            const remaining = inst.amount - (inst.paid_amount || 0)
            const isPartial = (inst.paid_amount ?? 0) > 0 && inst.status !== 'paid'
            const borderColor = filter === 'overdue' ? 'border-l-red-500' : filter === 'upcoming' ? 'border-l-amber-400' : 'border-l-blue-500'
            const avatarColor = 'bg-primary'
            const clientInitial = client?.name?.charAt(0)?.toUpperCase() || '?'
            return (
              <div key={inst.id} className={`bg-card rounded-xl border border-border border-l-4 ${borderColor} p-4 hover:shadow-sm transition-shadow`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0 bg-primary`}>
                      {clientInitial}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-foreground truncate">{client?.name || 'Eliminado'}</p>
                        {filter === 'overdue' && (
                          <Badge variant={inst.late_days > 60 ? 'late_61_90' : inst.late_days > 30 ? 'late_31_60' : 'late_1_30'}>
                            {inst.late_days}d atrasado
                          </Badge>
                        )}
                        {filter === 'today' && (
                          <Badge variant="active">Hoy</Badge>
                        )}
                        {filter === 'upcoming' && (
                          <Badge variant="active">{formatDate(inst.due_date)}</Badge>
                        )}
                        {isPartial && (
                          <Badge variant="active">Parcial</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isOpen ? 'Interés' : `Cuota #${inst.number}`} · {inst.loan?.loan_id || inst.loan_id}
                        {isPartial && <span className="text-blue-600 font-medium ml-1">({formatCurrency(inst.paid_amount!)} pagado)</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-foreground">
                      {isPartial ? formatCurrency(remaining) : formatCurrency(inst.amount)}
                    </p>
                    {remainingLate > 0 && (
                      <p className="text-xs text-destructive font-medium">+{formatCurrency(remainingLate)} mora</p>
                    )}
                    <Button size="sm" onClick={() => openPayment(inst)} className="mt-1.5 min-h-9">
                      <CurrencyDollar className="h-4 w-4 mr-1" /> Cobrar
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BottomSheet open={showPayment} onClose={() => { setShowPayment(false); setSelectedInstallment(null); setInstallmentMora(null) }} title="Registrar cobro">
        <form onSubmit={handlePay} className="space-y-4">
          {paymentError && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{paymentError}</div>
          )}
          {selectedInstallment && (() => {
            const inst = selectedInstallment
            const remaining = inst.amount - (inst.paid_amount || 0)
            const mora = installmentMora
            const moraAmount = includeMora && mora ? mora.lateAmount : 0
            return (
              <>
                <div className="bg-primary/5 rounded-xl p-4 text-sm space-y-1.5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-white border border-border flex items-center justify-center font-bold text-sm text-primary flex-shrink-0">
                      {inst.loan?.client?.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{inst.loan?.client?.name}</p>
                      <p className="text-xs text-muted-foreground">{inst.loan?.loan_id}</p>
                    </div>
                  </div>
                  {('isOpenEnded' in inst && inst.isOpenEnded) ? (
                    <p><span className="text-muted-foreground">Interés del período:</span> <strong>{formatCurrency(inst.amount)}</strong></p>
                  ) : (
                    <p><span className="text-muted-foreground">Cuota #{(inst as Installment).number}:</span> <strong>{formatCurrency(inst.amount)}</strong></p>
                  )}
                  <p><span className="text-muted-foreground">Vence:</span> <strong>{formatDate(inst.due_date)}</strong></p>
                  {(inst.paid_amount ?? 0) > 0 && (
                    <p className="text-blue-600"><span className="text-muted-foreground">Pagado antes:</span> <strong>{formatCurrency(inst.paid_amount!)}</strong></p>
                  )}
                  <p><span className="text-muted-foreground">Restante:</span> <strong>{formatCurrency(remaining)}</strong></p>
                  {mora && (
                    <p className="text-destructive"><span className="text-muted-foreground">Mora:</span> <strong>{formatCurrency(mora.lateAmount)}</strong> ({mora.lateDays} días)</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Monto</label>
                  <div className="flex gap-2">
                    <input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                      className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11" required />
                  </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                    <button type="button" onClick={() => setPaymentAmount(String(remaining + (includeMora && mora ? mora.lateAmount : 0)))} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">Completo</button>
                    <button type="button" onClick={() => { const v = parseFloat(paymentAmount) || 0; setPaymentAmount(String(Math.round(v / 2 * 100) / 100)) }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">Mitad</button>
                  </div>
                </div>
                {mora && (
                  <div className={`transition-all duration-200 ${includeMora ? 'opacity-100' : 'opacity-70'}`}>
                    <label className="flex items-center gap-2 text-sm p-3 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
                      <input type="checkbox" checked={includeMora}
                        onChange={e => { const c = e.target.checked; setIncludeMora(c); setPaymentAmount(String(c ? remaining + (mora?.lateAmount ?? 0) : remaining)) }}
                        className="rounded border-border h-4 w-4" />
                      <span>Incluir mora: <strong>{formatCurrency(mora.lateAmount)}</strong> ({mora.lateDays} días)</span>
                    </label>
                    {includeMora && (
                      <div className="mt-2 p-3 rounded-lg bg-muted border border-border animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal cuota</span><span className="font-medium">{formatCurrency(remaining)}</span></div>
                        <div className="flex justify-between text-sm mt-1"><span className="text-destructive">Mora ({mora.lateDays}d)</span><span className="font-medium text-destructive">+ {formatCurrency(mora.lateAmount)}</span></div>
                        <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold"><span>Total</span><span>{formatCurrency(remaining + mora.lateAmount)}</span></div>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Método</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                      className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11">
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="deposit">Depósito</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                  <div className="min-w-0">
                    <Input label="Fecha" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
                  </div>
                </div>
                <Input label="Notas" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Referencia del pago" />
                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" type="button" className="flex-1" onClick={() => { setShowPayment(false); setSelectedInstallment(null); setInstallmentMora(null) }}>Cancelar</Button>
                  <Button type="submit" loading={loading} className="flex-1">Cobrar</Button>
                </div>
              </>
            )
          })()}
        </form>
      </BottomSheet>

      <BottomSheet open={showQuickPayment} onClose={() => { setShowQuickPayment(false); setSelectedClientLoan(null); setQpAmount(''); setQpNotes(''); setClientSearch('') }} title="Registrar cobro rápido">
        <form onSubmit={handleQuickPayment} className="space-y-4">
          {qpError && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{qpError}</div>
          )}

          {!selectedClientLoan ? (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Seleccionar cliente</label>
              <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                placeholder="Buscar por nombre o teléfono..."
                className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11 mb-3" autoFocus />
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No se encontraron clientes con préstamos activos</p>
                ) : filteredClients.map(g => (
                  <button type="button" key={g.client.id} onClick={() => {
                    setSelectedClientLoan(g.loans[0].id)
                    setQpAmount(String(g.loans[0].remaining_amount))
                  }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left">
<div className="w-9 h-9 rounded-lg bg-white border border-border flex items-center justify-center font-bold text-xs text-primary flex-shrink-0">
                      {g.client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{g.client.name}</p>
                      <p className="text-xs text-muted-foreground">{g.loans.length} préstamo{g.loans.length !== 1 ? 's' : ''} · {g.client.phone || 'Sin teléfono'}</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{g.loans[0].loan_id}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="bg-primary/5 rounded-xl p-4 text-sm space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center font-bold text-xs text-white flex-shrink-0">
                    {selectedLoan?.client?.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{selectedLoan?.client?.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedLoan?.loan_id}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedClientLoan(null)}
                    className="ml-auto text-xs text-primary hover:underline">
                    Cambiar cliente
                  </button>
                </div>
                <p><span className="text-muted-foreground">Monto original:</span> <strong>{formatCurrency(selectedLoan?.amount || 0)}</strong></p>
                <p><span className="text-muted-foreground">Saldo restante:</span> <strong>{formatCurrency(selectedLoan?.remaining_amount || 0)}</strong></p>
                {selectedLoan?.open_ended && (
                  <p><span className="text-muted-foreground">Cuota período:</span> <strong>{formatCurrency(selectedLoan?.installment_amount || 0)}</strong></p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Monto</label>
                <input type="number" step="0.01" value={qpAmount} onChange={e => setQpAmount(e.target.value)}
                  className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11" required autoFocus />
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setQpAmount(String(Math.round((selectedLoan?.remaining_amount || 0) * 0.25 * 100) / 100))} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">25%</button>
                  <button type="button" onClick={() => setQpAmount(String(Math.round((selectedLoan?.remaining_amount || 0) * 0.5 * 100) / 100))} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">50%</button>
                  <button type="button" onClick={() => setQpAmount(String(Math.round((selectedLoan?.remaining_amount || 0) * 0.75 * 100) / 100))} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">75%</button>
                  <button type="button" onClick={() => setQpAmount(String(selectedLoan?.remaining_amount || 0))} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">100%</button>
                  {selectedLoan?.open_ended && (
                    <button type="button" onClick={() => setQpAmount(String(selectedLoan?.installment_amount || 0))} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">Cuota</button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Método</label>
                  <select value={qpMethod} onChange={e => setQpMethod(e.target.value)}
                    className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11">
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                    <option value="deposit">Depósito</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <Input label="Fecha" type="date" value={qpDate} onChange={e => setQpDate(e.target.value)} required />
                </div>
              </div>

              <Input label="Notas" value={qpNotes} onChange={e => setQpNotes(e.target.value)} placeholder="Referencia del pago" />

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" type="button" className="flex-1" onClick={() => { setShowQuickPayment(false); setSelectedClientLoan(null); setQpAmount(''); setQpNotes(''); setClientSearch('') }}>Cancelar</Button>
                <Button type="submit" loading={qpLoading} className="flex-1">Registrar pago</Button>
              </div>
            </>
          )}
        </form>
      </BottomSheet>
    </div>
  )
}
