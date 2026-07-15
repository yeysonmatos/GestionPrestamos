'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { useRouter } from 'next/navigation'
import {
  CalendarCheck, AlertTriangle, Calendar, DollarSign,
} from 'lucide-react'
import type { Installment, Payment, Client } from '@/types'

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
}

export default function CollectionsContent({
  todayInstallments, overdueInstallments, upcomingInstallments, recentPayments, openEndedLoans,
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
  const [filter, setFilter] = useState<'today' | 'overdue' | 'upcoming' | 'history'>('today')
  const [includeMora, setIncludeMora] = useState(true)
  const [installmentMora, setInstallmentMora] = useState<{ lateDays: number; lateAmount: number } | null>(null)

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

  const allToday = [...todayInstallments, ...synthetic.today]
  const allOverdue = [...overdueInstallments, ...synthetic.overdue]
  const allUpcoming = [...upcomingInstallments, ...synthetic.upcoming]

  const enrichedOverdue = useMemo(() => {
    return allOverdue.map(inst => {
      const lateDays = calculateLateDays(inst.due_date)
      const lateAmount = calculateLateAmount(inst.amount, lateDays, 0.5)
      return { ...inst, late_days: Math.max(inst.late_days, lateDays), late_amount: Math.max(inst.late_amount, lateAmount) }
    })
  }, [allOverdue])

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedInstallment || !userId) return
    setLoading(true)

    const amount = parseFloat(paymentAmount)
    const inst = selectedInstallment
    const loan = inst.loan
    const isOpenEndedType = 'isOpenEnded' in inst && inst.isOpenEnded
    const isInterestOnly = isOpenEndedType || loan?.amortization_type === 'interest_only'

    const installmentAmount = inst.amount
    const lateDays = calculateLateDays(inst.due_date)
    const totalLateAmount = calculateLateAmount(inst.amount, lateDays, 0.5)
    const previouslyPaid = inst.paid_amount || 0

    let paidToInstallment: number
    let paidToLate: number

    if (includeMora) {
      paidToInstallment = Math.min(amount, installmentAmount - previouslyPaid)
      paidToLate = Math.max(0, amount - paidToInstallment)
    } else {
      paidToInstallment = amount
      paidToLate = 0
    }

    const totalPaidOnInstallment = Math.min(previouslyPaid + paidToInstallment, installmentAmount)
    const isNowFullyPaid = totalPaidOnInstallment >= installmentAmount

    const capitalAmount = isInterestOnly ? 0 : Math.min(paidToInstallment, inst.capital)
    const interestAmount = isInterestOnly ? paidToInstallment : Math.min(paidToInstallment, inst.interest)

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        loan_id: inst.loan_id,
        installment_id: ('isOpenEnded' in inst && inst.isOpenEnded) ? null : (inst as Installment).id,
        client_id: inst.client_id,
        user_id: userId,
        amount,
        capital_amount: capitalAmount,
        interest_amount: interestAmount,
        late_amount: paidToLate,
        payment_date: paymentDate,
        method: paymentMethod,
        notes: paymentNotes || null,
      })
      .select()
      .single()

    if (!error && payment) {
      if (!('isOpenEnded' in inst) || !inst.isOpenEnded) {
        await supabase
          .from('installments')
          .update({
            status: isNowFullyPaid ? 'paid' : 'pending',
            paid_amount: totalPaidOnInstallment,
            late_amount: paidToLate,
            late_days: lateDays,
            paid_at: isNowFullyPaid ? paymentDate : null,
          })
          .eq('id', (inst as Installment).id)
      }

      if (loan) {
        const { data: updatedInstallments } = await supabase
          .from('installments')
          .select('*')
          .eq('loan_id', inst.loan_id)

        if (updatedInstallments) {
          const fullyPaidCount = updatedInstallments.filter(i => i.status === 'paid').length
          const paidAmount = updatedInstallments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
          const progress = updatedInstallments.length > 0
            ? Math.round((fullyPaidCount / updatedInstallments.length) * 100)
            : 0
          const remaining = isInterestOnly
            ? (loan.remaining_amount ?? 0)
            : Math.max(0, Number(loan.total_amount) - paidAmount)

          const updates: Record<string, string | number | boolean> = {
            paid_installments: fullyPaidCount,
            paid_amount: paidAmount,
            remaining_amount: remaining,
            progress,
          }
          if (!isInterestOnly && updatedInstallments.length > 0 && fullyPaidCount >= updatedInstallments.length) {
            updates.status = 'paid'
            updates.paid_at = new Date().toISOString()
          }

          await supabase.from('loans').update(updates).eq('id', inst.loan_id)
        }
      }

      await supabase.rpc('update_client_stats', { p_client_id: inst.client_id })

      setShowPayment(false)
      setSelectedInstallment(null)
      setPaymentAmount('')
      setInstallmentMora(null)
      router.refresh()
    }

    setLoading(false)
  }

  const todayTotal = allToday.reduce((s, i) => s + Number(i.amount), 0)
  const overdueTotal = enrichedOverdue.reduce((s, i) => s + Number(i.amount), 0)
  const upcomingTotal = allUpcoming.reduce((s, i) => s + Number(i.amount), 0)

  function openPayment(inst: Installment | SyntheticInstallment) {
    setSelectedInstallment(inst)
    const lateDays = calculateLateDays(inst.due_date)
    const lateAmount = lateDays > 0 ? calculateLateAmount(inst.amount, lateDays, 0.5) : 0
    const hasMora = lateAmount > 0
    setInstallmentMora(hasMora ? { lateDays, lateAmount } : null)
    setIncludeMora(hasMora)
    const remaining = inst.amount - (inst.paid_amount || 0)
    setPaymentAmount(String(hasMora ? remaining + lateAmount : remaining))
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
            { key: 'history', label: 'Historial', count: recentPayments.length },
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
          {recentPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin pagos registrados</p>
          ) : (
            <div className="space-y-2">
              {recentPayments.map(p => (
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
            return (
              <Card key={inst.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={client?.name || '?'} size="sm" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{client?.name || 'Eliminado'}</p>
                      <Badge variant={filter === 'overdue' ? 'late' : 'active'}>
                        {filter === 'today' ? 'Hoy' : filter === 'overdue' ? `Vence ${inst.late_days > 0 ? `hace ${inst.late_days}d` : ''}` : formatDate(inst.due_date)}
                      </Badge>
                      {(inst.paid_amount ?? 0) > 0 && (
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
                    {inst.late_amount > 0 && (
                      <p className="text-xs text-destructive">+{formatCurrency(inst.late_amount)} mora</p>
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
          {selectedInstallment && (() => {
            const inst = selectedInstallment
            const remaining = inst.amount - (inst.paid_amount || 0)
            const mora = installmentMora
            const cuotaSubtotal = includeMora ? remaining : parseFloat(paymentAmount || '0')
            const moraAmount = includeMora && mora ? mora.lateAmount : 0
            const total = (includeMora && mora ? remaining + mora.lateAmount : remaining)
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
