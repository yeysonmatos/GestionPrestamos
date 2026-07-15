'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { Progress } from '@/components/ui/Progress'
import { formatCurrency, formatDate, getStatusLabel, getLocalDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import { calculateLateDays, calculateLateAmount, calculateProportionalInterest, calculateFrenchProportionalInterest } from '@/lib/calculations'
import Link from 'next/link'
import { ArrowLeft, Printer, FileText, Undo, Share2, Check, Download } from 'lucide-react'
import type { Loan, Installment, Payment, Setting } from '@/types'

const statusVariant: Record<string, 'active' | 'paid' | 'cancelled' | 'default' | 'late'> = {
  active: 'active', paid: 'paid', late: 'late', cancelled: 'cancelled',
}

interface Props {
  loan: Loan
  installments: Installment[]
  payments: Payment[]
  settings: Setting | null
}

export default function LoanDetail({ loan: initialLoan, installments: initialInstallments, payments: initialPayments, settings }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [loan, setLoan] = useState(initialLoan)
  const [installments, setInstallments] = useState(initialInstallments)
  const [payments, setPayments] = useState(initialPayments)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentInstallmentId, setPaymentInstallmentId] = useState('')
  const [selectedPaymentInstallment, setSelectedPaymentInstallment] = useState<Installment | null>(null)
  const [selectedInstallmentMora, setSelectedInstallmentMora] = useState<{ lateDays: number; lateAmount: number } | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(false)
  const [showContract, setShowContract] = useState(false)
  const [showCapitalAbono, setShowCapitalAbono] = useState(false)
  const [capitalAbonoAmount, setCapitalAbonoAmount] = useState('')
  const [showLiquidation, setShowLiquidation] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [docs, setDocs] = useState<{ id: string; name: string; type: string; path: string; mime_type: string | null; size: number | null; loan_id: string | null; client_id: string; created_at: string }[]>([])
  const [showSuccess, setShowSuccess] = useState(false)
  const [successPayment, setSuccessPayment] = useState<Payment | null>(null)
  const [includeMora, setIncludeMora] = useState(true)

  const isInterestOnly = loan.amortization_type === 'interest_only'
  const isOpenEnded = loan.open_ended

  const periodicRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
    loadDocs()
  }, [])

  async function loadDocs() {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('loan_id', loan.id)
      .order('created_at', { ascending: false })
    if (data) setDocs(data)
  }

  async function handlePayInterest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0 || !userId) { setLoading(false); return }

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        loan_id: loan.id,
        client_id: loan.client_id,
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

    if (!error && payment) {
      if (!isOpenEnded) {
        const inst = installments.find(i => i.id === paymentInstallmentId)
        if (inst) {
          const lateDays = calculateLateDays(inst.due_date)
          const lateAmount = calculateLateAmount(inst.amount, lateDays, settings?.late_interest_rate || 0.5)

          await supabase
            .from('installments')
            .update({ status: 'paid', paid_at: paymentDate, paid_amount: amount, late_days: lateDays, late_amount: lateAmount })
            .eq('id', inst.id)

          setInstallments(prev => prev.map(i =>
            i.id === inst.id ? { ...i, status: 'paid' as const, paid_at: paymentDate, paid_amount: amount, late_days: lateDays, late_amount: lateAmount } : i
          ))
        }
      }

      const paidCount = isOpenEnded ? 0 : installments.filter(i => i.status === 'paid').length + 1
      const paidAmount = Number(loan.paid_amount) + amount
      const progress = isOpenEnded
        ? Math.round(((loan.amount - Number(loan.remaining_amount)) / loan.amount) * 100)
        : Math.round((paidCount / loan.installments) * 100)

      const updates: Record<string, string | number | boolean> = {
        paid_installments: paidCount,
        paid_amount: paidAmount,
        progress,
      }
      if (!isOpenEnded && !isInterestOnly && paidCount >= loan.installments) {
        updates.status = 'paid'
        updates.paid_at = new Date().toISOString()
      }

      await supabase.from('loans').update(updates).eq('id', loan.id)

      await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })
      setLoan(prev => ({ ...prev, ...updates }))
      setPayments(prev => [payment, ...prev])

      setSuccessPayment(payment)
      setShowSuccess(true)
      setPaymentAmount('')
      setPaymentInstallmentId('')
    }

    setLoading(false)
  }

  async function handlePayInstallment(e: React.FormEvent) {
    if (isInterestOnly && isOpenEnded) {
      return handlePayInterest(e)
    }

    e.preventDefault()
    setLoading(true)

    const amount = parseFloat(paymentAmount)
    const inst = installments.find(i => i.id === paymentInstallmentId)
    if (!inst || isNaN(amount) || amount <= 0 || !userId) { setLoading(false); return }

    const lateDays = calculateLateDays(inst.due_date)
    const lateAmount = includeMora ? calculateLateAmount(inst.amount, lateDays, settings?.late_interest_rate || 0.5) : 0

    const capitalAmount = isInterestOnly ? 0 : Math.min(amount, inst.capital)
    const interestAmount = isInterestOnly ? amount : Math.min(amount, inst.interest)

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        loan_id: loan.id,
        installment_id: inst.id,
        client_id: loan.client_id,
        user_id: userId,
        amount,
        capital_amount: capitalAmount,
        interest_amount: interestAmount,
        late_amount: lateAmount,
        payment_date: paymentDate,
        method: paymentMethod,
        notes: paymentNotes || null,
      })
      .select()
      .single()

    if (!error && payment) {
      await supabase
        .from('installments')
        .update({ status: 'paid', paid_at: paymentDate, paid_amount: amount, late_days: lateDays, late_amount: lateAmount })
        .eq('id', inst.id)

      const updatedInstallments = installments.map(i =>
        i.id === inst.id ? { ...i, status: 'paid' as const, paid_at: paymentDate, paid_amount: amount, late_days: lateDays, late_amount: lateAmount } : i
      )
      setInstallments(updatedInstallments)
      setPayments(prev => [payment, ...prev])

      const paidCount = updatedInstallments.filter(i => i.status === 'paid').length
      const paidAmount = updatedInstallments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
      const progress = Math.round((paidCount / loan.installments) * 100)
      const remaining = isInterestOnly
        ? loan.remaining_amount
        : Math.max(0, loan.total_amount - paidAmount)

      const updates: Record<string, string | number | boolean> = {
        paid_installments: paidCount,
        paid_amount: paidAmount,
        remaining_amount: remaining,
        progress,
      }
      if (!isInterestOnly && paidCount >= loan.installments) {
        updates.status = 'paid'
        updates.paid_at = new Date().toISOString()
      }

      await supabase.from('loans').update(updates).eq('id', loan.id)
      await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })
      setLoan(prev => ({ ...prev, ...updates }))

      setSuccessPayment(payment)
      setShowSuccess(true)
      setPaymentAmount('')
      setPaymentInstallmentId('')
    }

    setLoading(false)
  }

  function calcCapitalRemaining() {
    const capitalPaid = installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.capital, 0)
    const abonoPaid = payments.filter(p => p.type === 'capital_abono' && p.status === 'paid').reduce((s, p) => s + p.amount, 0)
    return Math.max(0, loan.amount - capitalPaid - abonoPaid)
  }

  function calcPendingMora() {
    let total = 0
    installments.filter(i => i.status === 'pending').forEach(inst => {
      const days = calculateLateDays(inst.due_date)
      if (days > 0) {
        total += calculateLateAmount(inst.amount, days, settings?.late_interest_rate || 0.5)
      }
    })
    return total
  }

  async function handleCapitalAbono(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const amount = parseFloat(capitalAbonoAmount)
    if (!amount || amount <= 0 || !userId) { setLoading(false); return }

    const remaining = Math.max(0, Number(loan.remaining_amount) - amount)

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        loan_id: loan.id,
        client_id: loan.client_id,
        user_id: userId,
        amount,
        capital_amount: amount,
        interest_amount: 0,
        payment_date: paymentDate,
        method: paymentMethod,
        type: 'capital_abono',
        notes: 'Abono al capital',
      })
      .select()
      .single()

    if (!error) {
      const currentCapitalRemaining = calcCapitalRemaining()
      const newCapitalRemaining = Math.max(0, currentCapitalRemaining - amount)
      const newProgress = Math.round(((loan.amount - newCapitalRemaining) / loan.amount) * 100)

      await supabase.from('loans').update({
        remaining_amount: remaining,
        paid_amount: Number(loan.paid_amount) + amount,
        progress: newProgress,
      }).eq('id', loan.id)
      await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })

      setLoan(prev => ({ ...prev, remaining_amount: remaining, paid_amount: Number(prev.paid_amount) + amount, progress: newProgress }))
      setPayments(prev => [payment, ...prev])
      setSuccessPayment(payment)
      setShowSuccess(true)
      setCapitalAbonoAmount('')
    }

    setLoading(false)
  }

  async function handleLiquidation() {
    if (!userId) return
    setLoading(true)

    const capitalRemaining = calcCapitalRemaining()
    if (capitalRemaining <= 0) { setLoading(false); return }

    const lastPayment = payments.filter(p => p.status === 'paid').sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]
    const lastPaymentDate = lastPayment?.payment_date || loan.first_payment_date
    const daysSinceLastPayment = Math.max(0, Math.floor((new Date().getTime() - new Date(lastPaymentDate).getTime()) / (1000 * 60 * 60 * 24)))
    const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
    const proportionalInterest = monthlyRate > 0
      ? calculateProportionalInterest(capitalRemaining, monthlyRate, daysSinceLastPayment)
      : 0
    const moraTotal = calcPendingMora()

    const totalToPay = capitalRemaining + proportionalInterest + moraTotal

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        loan_id: loan.id,
        client_id: loan.client_id,
        user_id: userId,
        amount: totalToPay,
        capital_amount: capitalRemaining,
        interest_amount: proportionalInterest,
        late_amount: moraTotal,
        payment_date: getLocalDate(),
        method: paymentMethod,
        type: 'liquidation',
        notes: `Liquidación total${proportionalInterest > 0 ? ` (interés proporcional ${daysSinceLastPayment}d)` : ''}${moraTotal > 0 ? ` + ${formatCurrency(moraTotal)} de mora` : ''}`,
      })
      .select()
      .single()

    if (!error) {
      await supabase.from('loans').update({
        status: 'paid',
        remaining_amount: 0,
        paid_amount: Number(loan.paid_amount) + totalToPay,
        progress: 100,
        paid_at: new Date().toISOString(),
      }).eq('id', loan.id)
      await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })

      setLoan(prev => ({ ...prev, status: 'paid', remaining_amount: 0, paid_amount: Number(prev.paid_amount) + totalToPay, progress: 100 }))
      setPayments(prev => [payment, ...prev])
      setSuccessPayment(payment)
      setShowSuccess(true)
      setShowLiquidation(false)
    }

    setLoading(false)
  }

  async function handleReversePayment(paymentId: string) {
    const reason = prompt('Motivo de la reversión:')
    if (!reason || !userId) return

    const payment = payments.find(p => p.id === paymentId)
    if (!payment || payment.status !== 'paid') return

    const { error } = await supabase
      .from('payments')
      .update({ status: 'reversed', reversal_reason: reason, reversed_at: new Date().toISOString(), reversed_by: userId })
      .eq('id', paymentId)

    if (error) return

    const newPaidAmount = Math.max(0, Number(loan.paid_amount) - Number(payment.amount))
    const newRemaining = isOpenEnded || isInterestOnly
      ? Number(loan.remaining_amount) + Number(payment.amount)
      : Number(loan.remaining_amount) + Number(payment.capital_amount)
    const newInstallments = !isInterestOnly && !isOpenEnded
      ? Math.max(0, (loan.paid_installments || 0) - 1)
      : loan.paid_installments

    await supabase.from('loans').update({
      paid_amount: newPaidAmount,
      remaining_amount: newRemaining,
      paid_installments: newInstallments,
      progress: isOpenEnded
        ? Math.round(((Number(loan.amount) - newRemaining) / Number(loan.amount)) * 100)
        : Math.round((newInstallments / loan.installments) * 100),
    }).eq('id', loan.id)

    await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })

    if (payment.installment_id) {
      await supabase
        .from('installments')
        .update({ status: 'pending', paid_at: null, paid_amount: 0, late_days: 0, late_amount: 0 })
        .eq('id', payment.installment_id)

      setInstallments(prev => prev.map(i =>
        i.id === payment.installment_id
          ? { ...i, status: 'pending' as const, paid_at: null, paid_amount: 0, late_days: 0, late_amount: 0 }
          : i
      ))
    }

    setLoan(prev => ({
      ...prev,
      paid_amount: newPaidAmount,
      remaining_amount: newRemaining,
      paid_installments: newInstallments,
    }))
    setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'reversed' as const, reversal_reason: reason } : p))
  }

  const progressValue = isOpenEnded
    ? Math.round(((loan.amount - Number(loan.remaining_amount)) / loan.amount) * 100)
    : loan.progress

  const lastPayment = payments.filter(p => p.status === 'paid').sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]
  const nextDueDate = isOpenEnded
    ? (() => {
        const last = lastPayment?.payment_date || loan.first_payment_date
        const next = new Date(last)
        next.setDate(loan.payment_day || 1)
        if (next <= new Date(last)) next.setMonth(next.getMonth() + 1)
        return formatDate(next.toISOString())
      })()
    : null

  return (
    <div className="space-y-6">
      <Link href="/loans" className="text-sm text-primary hover:underline flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Volver a préstamos
      </Link>

      <Card>
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{formatCurrency(loan.amount)}</h1>
              <Badge variant={statusVariant[loan.status] || 'default'}>{getStatusLabel(loan.status)}</Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {loan.loan_id} · {loan.client?.name} · {formatDate(loan.start_date)}
            </p>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span>{loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}</span>
              <span>{isOpenEnded ? 'Préstamo abierto' : `${loan.installments} cuotas`}</span>
              <span>{isInterestOnly ? 'Solo interés' : 'Francesa'}</span>
              <span>Tasa: {loan.interest_type === 'percentage' ? `${loan.interest_rate}%` : formatCurrency(loan.interest_rate)}</span>
              {loan.guarantee && <span>Garantía: {loan.guarantee}</span>}
            </div>
            {isOpenEnded && loan.payment_day && (
              <p className="text-xs text-muted-foreground mt-1">Día de pago: {loan.payment_day} de cada mes</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" size="sm" onClick={() => { loadDocs(); setShowDocs(true) }}>
              <FileText className="h-4 w-4 mr-1" /> Documentos
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowContract(true)}>
              <FileText className="h-4 w-4 mr-1" /> Contrato
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Recibo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => {
              const msg = `🧾 *RECIBO DE PAGO*\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(loan.amount)}\nCuota: ${formatCurrency(loan.installment_amount)}\nPagado: ${formatCurrency(loan.paid_amount)}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Mis Préstamos'}`
              const phone = loan.client?.whatsapp || loan.client?.phone
              if (phone) {
                window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
              } else {
                navigator.clipboard.writeText(msg.replace(/\*/g, '').replace(/_/g, '')).then(() => alert('Recibo copiado al portapapeles'))
              }
            }}>
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">{isInterestOnly ? 'Interés por período' : 'Cuota'}</p>
            <p className="font-semibold">{formatCurrency(loan.installment_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Capital</p>
            <p className="font-semibold">{formatCurrency(loan.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pagado</p>
            <p className="font-semibold text-success">{formatCurrency(loan.paid_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendiente</p>
            <p className="font-semibold text-warning">{formatCurrency(isInterestOnly ? loan.remaining_amount : loan.total_amount - loan.paid_amount)}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Progress value={progressValue} className="flex-1" />
          <span className="text-sm text-muted-foreground">
            {progressValue}% · {isOpenEnded ? `${formatCurrency(Number(loan.amount) - Number(loan.remaining_amount))}/${formatCurrency(loan.amount)} capital` : `${loan.paid_installments}/${loan.installments} cuotas`}
          </span>
        </div>

        {(() => {
          const pendingInstallments = installments.filter(i => i.status === 'pending')
          let totalLateDays = 0
          let totalLateAmount = 0
          let hasLate = false
          
          pendingInstallments.forEach(inst => {
            const days = calculateLateDays(inst.due_date)
            if (days > 0) {
              hasLate = true
              const lateAmt = calculateLateAmount(inst.amount, days, settings?.late_interest_rate || 0.5)
              totalLateDays = Math.max(totalLateDays, days)
              totalLateAmount += lateAmt
            }
          })
          
          if (hasLate) {
            return (
              <div key="mora-banner" className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-destructive font-medium">⏰ Préstamo atrasado</span>
                  <Badge variant="late">{totalLateDays} días de mora</Badge>
                  <span className="text-destructive font-medium ml-auto">{formatCurrency(totalLateAmount)} de mora</span>
                </div>
              </div>
            )
          }
          return null
        })()}

        {loan.status === 'active' && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-border">
            <Button size="sm" onClick={() => {
              setPaymentAmount(isOpenEnded ? String(loan.installment_amount) : '')
              setPaymentInstallmentId('')
              setIncludeMora(true)
              setShowPayment(true)
            }}>{isInterestOnly ? 'Pagar intereses' : 'Realizar pago'}</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowCapitalAbono(true)}>Abonar al capital</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowLiquidation(true)}>Liquidar préstamo</Button>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">{isOpenEnded ? 'Resumen del préstamo' : 'Calendario de pagos'}</h3>
        </div>

        {isOpenEnded ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Préstamo abierto — no tiene límite de cuotas.</p>
            <p>Interés por período: <strong>{formatCurrency(loan.installment_amount)}</strong></p>
            {nextDueDate && <p>Próximo vencimiento: <strong>{nextDueDate}</strong></p>}
            <p>Capital pendiente: <strong>{formatCurrency(loan.remaining_amount)}</strong></p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Vencimiento</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">{isInterestOnly ? 'Interés' : 'Cuota'}</th>
                  {!isInterestOnly && <th className="text-right py-2 px-3 font-medium text-muted-foreground">Capital</th>}
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">Interés</th>
<th className="text-right py-2 px-3 font-medium text-muted-foreground">Saldo</th>
              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Mora</th>
              <th className="text-center py-2 px-3 font-medium text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody>
                {installments.map(inst => (
                  <tr key={inst.number} className="border-b border-border hover:bg-muted">
                    <td className="py-2 px-3 font-medium">{inst.number}</td>
                    <td className="py-2 px-3">{formatDate(inst.due_date)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(inst.amount)}</td>
                    {!isInterestOnly && <td className="py-2 px-3 text-right">{formatCurrency(inst.capital)}</td>}
                    <td className="py-2 px-3 text-right">{formatCurrency(inst.interest)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(inst.balance)}</td>
                    <td className="py-2 px-3 text-center">
                      {inst.late_days > 0 && (
                        <span className="text-xs text-destructive font-medium">
                          {inst.late_days}d · {formatCurrency(inst.late_amount)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant={inst.status === 'paid' ? 'paid' : 'active'}>
                        {inst.status === 'paid' ? 'Pagado' : 'Pendiente'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-foreground mb-4">Últimos pagos ({payments.length})</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin pagos registrados</p>
        ) : (
          <div className="space-y-2">
            {payments.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-foreground">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.method}
                    {p.type === 'capital_abono' && ' · Abono al capital'}
                    {p.type === 'liquidation' && ' · Liquidación'}
                    {p.type === 'installment' && ' · Interés'}
                    {p.notes && ` · ${p.notes}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</span>
                  {p.status === 'paid' && (
                    <button onClick={() => {
                      const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(p.amount)}\nFecha: ${formatDate(p.payment_date)}\nMétodo: ${p.method}${p.notes ? `\nNota: ${p.notes}` : ''}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Mis Préstamos'}`
                      const phone = loan.client?.whatsapp || loan.client?.phone
                      if (phone) {
                        window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
                      } else {
                        navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
                      }
                    }} className="text-primary hover:text-primary/80" title="Enviar recibo por WhatsApp">
                      <Share2 className="h-4 w-4" />
                    </button>
                  )}
                  {p.status === 'paid' ? (
                    <button onClick={() => handleReversePayment(p.id)} className="text-destructive hover:text-destructive">
                      <Undo className="h-4 w-4" />
                    </button>
                  ) : (
                    <Badge variant="cancelled">Reversado</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

<Modal open={showPayment} onClose={() => setShowPayment(false)} title={isInterestOnly ? 'Pagar intereses' : 'Realizar pago'}>
        <form onSubmit={handlePayInstallment} className="space-y-4">
          {!isOpenEnded && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isInterestOnly ? 'Cuota de interés a pagar' : 'Cuota a pagar'}</label>
              <select
                value={paymentInstallmentId}
                onChange={e => {
                  const id = e.target.value
                  setPaymentInstallmentId(id)
                  const inst = installments.find(i => i.id === id)
                  if (inst) {
                    const lateDays = calculateLateDays(inst.due_date)
                    const lateAmount = lateDays > 0
                      ? calculateLateAmount(inst.amount, lateDays, settings?.late_interest_rate || 0.5)
                      : 0
                    setPaymentAmount(String(inst.amount + (includeMora && lateAmount > 0 ? lateAmount : 0)))
                    setSelectedPaymentInstallment(inst)
                    setSelectedInstallmentMora(lateDays > 0 ? { lateDays, lateAmount } : null)
                  }
                }}
                className="block w-full rounded-lg border border-border px-3 py-2 text-sm"
                required
              >
                <option value="">Seleccionar cuota...</option>
                {installments.filter(i => i.status === 'pending').map(inst => (
                  <option key={inst.id} value={inst.id}>
                    #{inst.number} - {formatCurrency(inst.amount)} - Vence: {formatDate(inst.due_date)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isOpenEnded && (
            <p className="text-sm text-muted-foreground">
              Interés del período: <strong>{formatCurrency(loan.installment_amount)}</strong>
              {nextDueDate && <> · Vence: <strong>{nextDueDate}</strong></>}
            </p>
          )}
          <Input label="Monto" type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} required />
          {selectedInstallmentMora && selectedPaymentInstallment && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeMora}
                  onChange={e => {
                    const checked = e.target.checked
                    setIncludeMora(checked)
                    const baseAmount = selectedPaymentInstallment.amount
                    const moraAmount = selectedInstallmentMora.lateAmount
                    setPaymentAmount(String(checked ? baseAmount + moraAmount : baseAmount))
                  }}
                  className="rounded border-border"
                />
                <span>Incluir mora: <strong>{formatCurrency(selectedInstallmentMora.lateAmount)}</strong> ({selectedInstallmentMora.lateDays} días)</span>
              </label>
              <p className="text-sm text-right font-semibold">
                Total: {formatCurrency(selectedPaymentInstallment.amount)}
                {includeMora && <> + {formatCurrency(selectedInstallmentMora.lateAmount)}</>}
                {' = '}
                <span className="text-foreground">{formatCurrency(selectedPaymentInstallment.amount + (includeMora ? selectedInstallmentMora.lateAmount : 0))}</span>
              </p>
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
            <Button variant="secondary" type="button" onClick={() => setShowPayment(false)}>Cancelar</Button>
            <Button type="submit" loading={loading}>Pagar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showCapitalAbono} onClose={() => setShowCapitalAbono(false)} title="Abonar al capital">
        <form onSubmit={handleCapitalAbono} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Capital pendiente: <strong>{formatCurrency(calcCapitalRemaining())}</strong>
          </p>
          <Input label="Monto a abonar" type="number" step="0.01" min="0.01" max={calcCapitalRemaining()}
            value={capitalAbonoAmount} onChange={e => setCapitalAbonoAmount(e.target.value)} required />
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
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
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowCapitalAbono(false)}>Cancelar</Button>
            <Button type="submit" loading={loading}>Abonar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showLiquidation} onClose={() => setShowLiquidation(false)} title="Liquidar préstamo">
        <div className="space-y-4">
          {(() => {
            const capRemaining = calcCapitalRemaining()
            if (capRemaining <= 0) return <p className="text-sm text-muted-foreground">No hay capital pendiente</p>

            const lastPayment = payments.filter(p => p.status === 'paid').sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]
            const lastDate = lastPayment?.payment_date || loan.first_payment_date
            const days = Math.max(0, Math.floor((new Date().getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)))
            const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
            const propInterest = monthlyRate > 0 ? calculateProportionalInterest(capRemaining, monthlyRate, days) : 0
            const mora = calcPendingMora()
            const total = capRemaining + propInterest + mora

            return (
              <div className="space-y-3">
                <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capital pendiente</span>
                    <span className="font-semibold">{formatCurrency(capRemaining)}</span>
                  </div>
                  {propInterest > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interés proporcional ({days}d)</span>
                      <span className="font-semibold">{formatCurrency(propInterest)}</span>
                    </div>
                  )}
                  {mora > 0 && (
                    <div className="flex justify-between">
                      <span className="text-destructive">Mora pendiente</span>
                      <span className="font-semibold text-destructive">{formatCurrency(mora)}</span>
                    </div>
                  )}
                  <hr className="border-border my-1" />
                  <div className="flex justify-between text-base">
                    <span className="font-bold">Monto total restante</span>
                    <span className="font-bold text-foreground">{formatCurrency(total)}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Al liquidar, el préstamo se marcará como pagado.
                </p>
              </div>
            )
          })()}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowLiquidation(false)}>Cancelar</Button>
            <Button onClick={handleLiquidation} loading={loading}>Confirmar liquidación</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showContract} onClose={() => setShowContract(false)} title="Contrato de préstamo" className="max-w-2xl">
        <div className="text-sm text-gray-700 space-y-3">
          <p className="text-center font-bold text-base">CONTRATO DE PRÉSTAMO</p>
          <p>Por medio del presente contrato, se formaliza el préstamo entre:</p>
          <p><strong>PRESTAMISTA:</strong> {settings?.business_name || 'El Prestamista'}</p>
          <p><strong>CLIENTE:</strong> {loan.client?.name}</p>
          <p><strong>MONTO:</strong> {formatCurrency(loan.amount)}</p>
          <p><strong>INTERÉS:</strong> {loan.interest_type === 'percentage' ? `${loan.interest_rate}%` : formatCurrency(loan.interest_rate)}</p>
          {isInterestOnly ? (
            <>
              <p><strong>TIPO:</strong> Solo interés (pagos periódicos de interés, capital al liquidar)</p>
              <p><strong>INTERÉS POR PERÍODO:</strong> {formatCurrency(loan.installment_amount)}</p>
            </>
          ) : (
            <>
              <p><strong>MONTO TOTAL A PAGAR:</strong> {formatCurrency(loan.total_amount)}</p>
              <p><strong>CUOTAS:</strong> {loan.installments} de {formatCurrency(loan.installment_amount)}</p>
            </>
          )}
          <p><strong>CUOTAS:</strong> {isOpenEnded ? 'Abierto (sin límite)' : loan.installments}</p>
          <p><strong>FRECUENCIA:</strong> {loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}</p>
          {isOpenEnded && loan.payment_day && <p><strong>DÍA DE PAGO:</strong> {loan.payment_day} de cada mes</p>}
          <p><strong>FECHA DE INICIO:</strong> {formatDate(loan.start_date)}</p>
          <p><strong>PRIMER PAGO:</strong> {formatDate(loan.first_payment_date)}</p>
          {loan.guarantee && <p><strong>GARANTÍA:</strong> {loan.guarantee}</p>}
          <p className="pt-4 text-xs text-muted-foreground">Documento generado el {formatDate(new Date().toISOString())}</p>
        </div>
      </Modal>

      <Modal open={showDocs} onClose={() => setShowDocs(false)} title="Documentos del préstamo" className="max-w-lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {['contract', 'promissory', 'guarantee', 'photo'].map(type => {
              const labels: Record<string, string> = { contract: 'Contrato', promissory: 'Pagaré', guarantee: 'Garantía', photo: 'Foto' }
              return (
                <label key={type} className="flex flex-col items-center gap-1 p-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary text-xs text-muted-foreground">
                  <span>{labels[type]}</span>
                  <input type="file" className="hidden" accept="image/*,.pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file || !userId) return
                      const path = `loans/${loan.id}/${type}_${Date.now()}`
                      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file)
                      if (uploadErr) return
                      await supabase.from('documents').insert({
                        client_id: loan.client_id,
                        loan_id: loan.id,
                        user_id: userId,
                        name: file.name,
                        type,
                        path,
                        mime_type: file.type,
                        size: file.size,
                      })
                      loadDocs()
                    }} />
                </label>
              )
            })}
          </div>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin documentos</p>
          ) : (
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.type === 'contract' ? 'Contrato' : doc.type === 'promissory' ? 'Pagaré' : doc.type === 'guarantee' ? 'Garantía' : 'Foto'}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="secondary" size="sm" onClick={async () => {
                      const { data } = await supabase.storage.from('documents').createSignedUrl(doc.path, 60)
                      if (data) window.open(data.signedUrl, '_blank')
                    }}>Ver</Button>
                    <Button variant="secondary" size="sm" onClick={async () => {
                      await supabase.from('documents').delete().eq('id', doc.id)
                      await supabase.storage.from('documents').remove([doc.path])
                      loadDocs()
                    }} className="text-destructive">Eliminar</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal open={showSuccess} onClose={() => setShowSuccess(false)} title="Pago exitoso">
        <div className="text-center space-y-5 py-2">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-xl font-semibold text-foreground">Pago registrado correctamente</p>
          <div className="bg-muted rounded-lg p-4 text-left space-y-1.5 text-sm">
            <p className="flex justify-between"><span className="text-muted-foreground">Monto:</span> <strong>{formatCurrency(successPayment?.amount || 0)}</strong></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Fecha:</span> <strong>{formatDate(paymentDate)}</strong></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Método:</span> <strong>{paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'transfer' ? 'Transferencia' : paymentMethod === 'deposit' ? 'Depósito' : 'Otro'}</strong></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Pendiente:</span> <strong>{formatCurrency(loan.remaining_amount)}</strong></p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
              <Download className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(successPayment?.amount || 0)}\nFecha: ${formatDate(paymentDate)}\nMétodo: ${paymentMethod}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Mis Préstamos'}`
              const phone = loan.client?.whatsapp || loan.client?.phone
              if (phone) {
                window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
              } else {
                navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
              }
            }}>
              <Share2 className="h-4 w-4 mr-1" /> WhatsApp
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(successPayment?.amount || 0)}\nFecha: ${formatDate(paymentDate)}\nMétodo: ${paymentMethod}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Mis Préstamos'}`
              navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
            }}>
              <Share2 className="h-4 w-4 mr-1" /> Compartir
            </Button>
          </div>
          <Button className="w-full" onClick={() => setShowSuccess(false)}>Cerrar</Button>
        </div>
      </Modal>
    </div>
  )
}
