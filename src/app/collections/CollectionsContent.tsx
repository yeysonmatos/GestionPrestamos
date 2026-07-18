'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import SearchInput from '@/components/ui/SearchInput'
import PageHeader from '@/components/ui/PageHeader'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import { calculateLateDays, calculateLateAmount } from '@/lib/calculations'
import { processInstallmentPayment, updateLoanAfterPayment } from '@/lib/payments'
import { useRouter } from 'next/navigation'
import {
  CalendarCheck, AlertTriangle, Calendar, DollarSign,
} from 'lucide-react'
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

interface Props {
  todayInstallments: Installment[]
  overdueInstallments: Installment[]
  upcomingInstallments: Installment[]
  recentPayments: Payment[]
  openEndedLoans: OpenEndedLoan[]
  settings: Setting | null
}

export default function CollectionsContent({
  todayInstallments: initialToday, overdueInstallments: initialOverdue, upcomingInstallments: initialUpcoming, recentPayments: initialPayments, openEndedLoans, settings,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | SyntheticInstallment | null>(null)
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
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary-light flex items-center justify-center">
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(todayTotal)}</p>
            <p className="text-xs text-muted-foreground">Hoy ({allToday.length})</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(overdueTotal)}</p>
            <p className="text-xs text-muted-foreground">Vencidos ({enrichedOverdue.length})</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
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
        <div className="flex gap-1">
          {([
            { key: 'today', label: 'Hoy', count: allToday.length },
            { key: 'overdue', label: 'Vencidos', count: enrichedOverdue.length },
            { key: 'upcoming', label: 'Próximos', count: allUpcoming.length },
            { key: 'history', label: 'Historial', count: payments.length },
          ] as const).map(tab => (
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

      {filter === 'history' ? (
        <Card>
          <h3 className="text-base font-semibold text-foreground mb-4">Últimos cobros realizados</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin pagos registrados</p>
          ) : (
            <div className="space-y-2">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.loan?.client?.name || '?'} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.loan?.client?.name}</p>
                      <p className="text-xs text-muted-foreground">{p.method} · {formatDate(p.payment_date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-success">{formatCurrency(p.amount)}</p>
                    {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : filteredList.length === 0 ? (
        <Card><p className="text-sm text-muted-foreground text-center py-8">No hay cuotas pendientes</p></Card>
      ) : (
        <div className="space-y-3">
          {filteredList.map((inst: Installment | SyntheticInstallment) => {
            const client = inst.loan?.client
            const isOpen = ('isOpenEnded' in inst && inst.isOpenEnded)
            const remainingLate = Math.max(0, (inst.late_amount || 0) - ((inst as Installment).paid_late_amount || 0))
            return (
              <Card key={inst.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={client?.name || '?'} size="sm" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{client?.name || 'Eliminado'}</p>
                      <Badge variant={
                        filter === 'overdue'
                          ? inst.late_days > 60 ? 'late_61_90'
                            : inst.late_days > 30 ? 'late_31_60'
                            : inst.late_days > 0 ? 'late_1_30'
                            : 'late'
                          : 'active'
                      }>
                        {filter === 'today' ? 'Hoy' : filter === 'overdue' ? `Vence ${inst.late_days > 0 ? `hace ${inst.late_days}d` : ''}` : formatDate(inst.due_date)}
                      </Badge>
                      {(inst.paid_amount ?? 0) > 0 && inst.status !== 'paid' && (
                        <Badge variant="active">Parcial</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isOpen ? 'Interés' : `Cuota #${inst.number}`} · {inst.loan?.loan_id || inst.loan_id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-bold text-foreground">{formatCurrency(inst.amount)}</p>
                    {remainingLate > 0 && (
                      <p className="text-xs text-destructive">+{formatCurrency(remainingLate)} mora</p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => openPayment(inst)}>
                    <DollarSign className="h-4 w-4 mr-1" /> Cobrar
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="Registrar cobro">
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
                <div className="bg-primary-light rounded-lg p-3 text-sm text-primary">
                  <p><strong>Cliente:</strong> {inst.loan?.client?.name}</p>
                  {('isOpenEnded' in inst && inst.isOpenEnded) ? (
                    <p><strong>Interés del período</strong> — {formatCurrency(inst.amount)}</p>
                  ) : (
                    <p><strong>Cuota #{(inst as Installment).number}</strong> — {formatCurrency(inst.amount)}</p>
                  )}
                  <p><strong>Vence:</strong> {formatDate(inst.due_date)}</p>
                  {(inst.paid_amount ?? 0) > 0 && (
                    <p className="text-warning font-medium"><strong>Pagado antes:</strong> {formatCurrency(inst.paid_amount!)}</p>
                  )}
                  {remaining > 0 && <p><strong>Restante:</strong> {formatCurrency(remaining)}</p>}
                  {mora && (
                    <p className="text-destructive font-medium">
                      <strong>Mora:</strong> {formatCurrency(mora.lateAmount)} ({mora.lateDays} días)
                    </p>
                  )}
                </div>
                <Input label="Monto" type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} required />
                {mora && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={includeMora}
                        onChange={e => {
                          const checked = e.target.checked
                          setIncludeMora(checked)
                          setPaymentAmount(String(checked ? remaining + (mora?.lateAmount ?? 0) : remaining))
                        }}
                        className="rounded border-border"
                      />
                      <span>Incluir mora: <strong>{formatCurrency(mora.lateAmount)}</strong></span>
                    </label>
                    <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal cuota</span>
                        <span className="font-medium">{formatCurrency(remaining)}</span>
                      </div>
                      {includeMora && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Mora ({mora.lateDays}d)</span>
                          <span className="font-medium text-destructive">{formatCurrency(mora.lateAmount)}</span>
                        </div>
                      )}
                      <div className="border-t pt-1 flex justify-between font-semibold">
                        <span>Total</span>
                        <span>{formatCurrency(includeMora ? remaining + mora.lateAmount : remaining)}</span>
                      </div>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Método</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                      className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm">
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
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" type="button" onClick={() => { setShowPayment(false); setSelectedInstallment(null); setInstallmentMora(null) }}>Cancelar</Button>
                  <Button type="submit" loading={loading}>Registrar cobro</Button>
                </div>
              </>
            )
          })()}
        </form>
      </Modal>
    </div>
  )
}
