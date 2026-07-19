'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import BottomSheet from '@/components/ui/BottomSheet'
import { Progress } from '@/components/ui/Progress'
import { formatCurrency, formatDate, getStatusLabel, getLocalDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase-client'
import { calculateLateDays, calculateLateAmount, calculateProportionalInterest, calculateLoan } from '@/lib/calculations'
import { processInstallmentPayment, updateLoanAfterPayment, recalculateInstallment } from '@/lib/payments'
import Link from 'next/link'
import { ArrowLeft, FileText, ArrowCounterClockwise, ShareNetwork, Check, DownloadSimple, ChatCircle, Scroll, FileArrowDown } from '@phosphor-icons/react'
import type { Loan, Installment, Payment, Setting } from '@/types'

const statusVariant: Record<string, 'active' | 'paid' | 'cancelled' | 'default' | 'late' | 'late_1_30' | 'late_31_60' | 'late_61_90'> = {
  active: 'active', paid: 'paid', late: 'late', late_1_30: 'late_1_30', late_31_60: 'late_31_60', late_61_90: 'late_61_90', cancelled: 'cancelled',
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
  const [paymentError, setPaymentError] = useState('')
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

    if (error) {
      setPaymentError('Error al registrar pago: ' + error.message)
      setLoading(false)
      return
    }

    if (payment) {
      if (!isOpenEnded) {
        const inst = installments.find(i => i.id === paymentInstallmentId)
        if (inst) {
          const graceDays = settings?.grace_days || 0
          const lateDays = calculateLateDays(inst.due_date, graceDays)
          const remainingLate = inst.amount - (inst.paid_amount || 0)
          const lateAmount = calculateLateAmount(remainingLate > 0 ? remainingLate : inst.amount, lateDays, settings?.late_interest_rate || 0.5)

          await supabase
            .from('installments')
            .update({ status: 'paid', paid_at: paymentDate, paid_amount: amount, late_days: lateDays, late_amount: lateAmount })
            .eq('id', inst.id)

          setInstallments(prev => prev.map(i =>
            i.id === inst.id ? { ...i, status: 'paid' as const, paid_at: paymentDate, paid_amount: amount, late_days: lateDays, late_amount: lateAmount } : i
          ))
        }
      }

      const paidAmount = Number(loan.paid_amount) + amount
      const updates: Record<string, string | number | boolean> = {
        paid_amount: paidAmount,
        remaining_amount: Math.max(0, Number(loan.remaining_amount) - amount),
      }
      if (!isOpenEnded) {
        const paidCount = isInterestOnly
          ? 0
          : installments.filter(i => i.status === 'paid').length + 1
        updates.paid_installments = paidCount
        updates.progress = Math.round((paidCount / loan.installments) * 100)
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

    try {
      const lateInterestRate = settings?.late_interest_rate || 0.5
      const graceDays = settings?.grace_days || 0

      const { payment, allocation } = await processInstallmentPayment(supabase as any, {
        loan,
        installment: inst,
        amount,
        includeMora,
        paymentDate,
        method: paymentMethod,
        notes: paymentNotes,
        userId,
        lateInterestRate,
        graceDays,
      })

      const loanUpdates = await updateLoanAfterPayment(supabase as any, loan.id, loan.client_id)

      const newStatus = allocation.isNowFullyPaid ? 'paid' as const : allocation.totalPaidOnInstallment > 0 ? 'partial' as const : 'pending' as const
      const updatedInstallment: Installment = {
        ...inst,
        status: newStatus,
        paid_amount: allocation.totalPaidOnInstallment,
        paid_late_amount: allocation.newPaidLateAmount,
        late_amount: allocation.totalLateAmount,
        late_days: allocation.lateDays,
        paid_at: allocation.isNowFullyPaid ? paymentDate : null,
      }

      setInstallments(prev => prev.map(i =>
        i.id === inst.id ? updatedInstallment : i
      ))
      setLoan(prev => ({ ...prev, ...loanUpdates }))
      setPayments(prev => [payment, ...prev])

      setSuccessPayment(payment)
      setShowSuccess(true)
      setPaymentAmount('')
      setPaymentInstallmentId('')
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Error al procesar el pago')
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
    const rate = settings?.late_interest_rate || 0.5
    const graceDays = settings?.grace_days || 0
    installments.filter(i => i.status === 'pending' || i.status === 'partial').forEach(inst => {
      const days = calculateLateDays(inst.due_date, graceDays)
      if (days > 0) {
        const remaining = inst.amount - (inst.paid_amount || 0)
        const totalLate = calculateLateAmount(remaining > 0 ? remaining : inst.amount, days, rate)
        const paidLate = inst.paid_late_amount || 0
        total += Math.max(0, totalLate - paidLate)
      }
    })
    return total
  }

  async function handleCapitalAbono(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const abono = parseFloat(capitalAbonoAmount)
    if (!abono || abono <= 0 || !userId) { setLoading(false); return }

    const remaining = Math.max(0, Number(loan.remaining_amount) - abono)

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        loan_id: loan.id,
        client_id: loan.client_id,
        user_id: userId,
        amount: abono,
        capital_amount: abono,
        interest_amount: 0,
        payment_date: paymentDate,
        method: paymentMethod,
        type: 'capital_abono',
        notes: 'Abono al capital',
      })
      .select()
      .single()

    if (!error) {
      const pendingInsts = installments.filter(i => i.status !== 'paid').sort((a, b) => a.number - b.number)
      const newProgress = Math.round(((loan.amount - (calcCapitalRemaining() - abono)) / loan.amount) * 100)

      if (isInterestOnly && pendingInsts.length > 0) {
        const daysInPeriod = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }[loan.frequency] || 30
        const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
        const periodicRate = monthlyRate / 30 * daysInPeriod
        const currentPrincipal = Number(loan.remaining_amount)
        const newPrincipal = Math.max(0, currentPrincipal - abono)
        const newInterestPerPeriod = Math.round(newPrincipal * periodicRate * 100) / 100
        const lastNum = pendingInsts[pendingInsts.length - 1].number

        for (const inst of pendingInsts) {
          const isLast = inst.number === lastNum
          const newAmount = isLast ? newInterestPerPeriod + newPrincipal : newInterestPerPeriod

          await supabase.from('installments').update({
            amount: newAmount,
            capital: isLast ? newPrincipal : 0,
            interest: newInterestPerPeriod,
            balance: isLast ? 0 : newPrincipal,
          }).eq('id', inst.id)
        }

        await supabase.from('loans').update({
          installment_amount: newInterestPerPeriod,
          remaining_amount: remaining,
          paid_amount: Number(loan.paid_amount) + abono,
          progress: newProgress,
        }).eq('id', loan.id)

        setLoan(prev => ({ ...prev, installment_amount: newInterestPerPeriod, remaining_amount: remaining, paid_amount: Number(prev.paid_amount) + abono, progress: newProgress }))
        setInstallments(prev => prev.map(inst => {
          if (inst.status === 'paid') return inst
          const isLast = inst.number === lastNum
          const newAmt = isLast ? newInterestPerPeriod + newPrincipal : newInterestPerPeriod
          return { ...inst, amount: newAmt, capital: isLast ? newPrincipal : 0, interest: newInterestPerPeriod, balance: isLast ? 0 : newPrincipal }
        }))
      } else {
        let remainingAbono = abono
        const reductions: Record<string, number> = {}

        for (const inst of pendingInsts) {
          if (remainingAbono <= 0) break
          const reduction = Math.min(remainingAbono, inst.capital)
          reductions[inst.id] = reduction
          remainingAbono -= reduction

          await supabase.from('installments').update({
            amount: Math.max(0, inst.amount - reduction),
            capital: Math.max(0, inst.capital - reduction),
            balance: Math.max(0, inst.balance - reduction),
          }).eq('id', inst.id)
        }

        await supabase.from('loans').update({
          remaining_amount: remaining,
          paid_amount: Number(loan.paid_amount) + abono,
          progress: newProgress,
        }).eq('id', loan.id)

        setLoan(prev => ({ ...prev, remaining_amount: remaining, paid_amount: Number(prev.paid_amount) + abono, progress: newProgress }))
        setInstallments(prev => prev.map(inst => {
          const reduction = reductions[inst.id]
          return reduction ? { ...inst, amount: Math.max(0, inst.amount - reduction), capital: Math.max(0, inst.capital - reduction), balance: Math.max(0, inst.balance - reduction) } : inst
        }))
      }

      await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })
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

      const today = new Date().toISOString().split('T')[0]
      const { data: liquidatedInsts } = await supabase
        .from('installments')
        .update({ status: 'paid', paid_at: today, paid_amount: 0 })
        .eq('loan_id', loan.id)
        .neq('status', 'paid')
        .select()

      await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })

      if (liquidatedInsts) {
        setInstallments(prev => prev.map(i =>
          liquidatedInsts.some(li => li.id === i.id)
            ? { ...i, status: 'paid' as const, paid_at: today }
            : i
        ))
      }

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

    const { error: revError } = await supabase
      .from('payments')
      .update({ status: 'reversed', reversal_reason: reason, reversed_at: new Date().toISOString(), reversed_by: userId })
      .eq('id', paymentId)

    if (revError) {
      alert('Error al revertir el pago: ' + revError.message)
      return
    }

    const newPaidAmount = Math.max(0, Number(loan.paid_amount) - Number(payment.amount))
    const newRemaining = Number(loan.remaining_amount) + Number(payment.amount)

    if (payment.type === 'capital_abono') {
      await supabase.from('loans').update({
        paid_amount: newPaidAmount,
        remaining_amount: newRemaining,
      }).eq('id', loan.id)

      await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })

      const pendingInsts = installments.filter(i => i.status !== 'paid')

      if (pendingInsts.length > 0) {
        const originalSchedule = calculateLoan({
          amount: Number(loan.amount),
          interest_type: loan.interest_type,
          interest_rate: Number(loan.interest_rate),
          installments: loan.installments,
          frequency: loan.frequency,
          start_date: loan.start_date,
          amortization_type: loan.amortization_type,
          open_ended: loan.open_ended,
        })

        for (const inst of pendingInsts) {
          const original = originalSchedule.installments.find(r => r.number === inst.number)
          if (original) {
            await supabase.from('installments').update({
              amount: original.amount,
              capital: original.capital,
              interest: original.interest,
              balance: original.balance,
            }).eq('id', inst.id)
          }
        }

        setInstallments(prev => prev.map(inst => {
          if (inst.status === 'paid') return inst
          const original = originalSchedule.installments.find(r => r.number === inst.number)
          return original ? { ...inst, amount: original.amount, capital: original.capital, interest: original.interest, balance: original.balance } : inst
        }))
      }

      setLoan(prev => ({
        ...prev,
        paid_amount: newPaidAmount,
        remaining_amount: newRemaining,
      }))
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'reversed' as const, reversal_reason: reason } : p))
      return
    }

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
      const updated = await recalculateInstallment(supabase as any, payment.installment_id)

      setInstallments(prev => prev.map(i =>
        i.id === payment.installment_id
          ? { ...i, ...updated } as Installment
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
              {loan.client?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{formatCurrency(loan.amount)}</h1>
                <Badge variant={statusVariant[loan.status] || 'default'}>{getStatusLabel(loan.status)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {loan.loan_id} · {loan.client?.name} · {formatDate(loan.start_date)}
                {loan.client?.phone && (
                  <span> · <a href={`tel:${loan.client.phone}`} className="text-primary hover:underline">{loan.client.phone}</a></span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button type="button" onClick={() => {
              const phone = loan.client?.whatsapp || loan.client?.phone
              if (phone) {
                window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`🧾 ${loan.loan_id} · ${loan.client?.name}`)}`, '_blank')
              }
            }} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="WhatsApp">
              <ChatCircle className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => { loadDocs(); setShowDocs(true) }} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Documentos">
              <FileText className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setShowContract(true)} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-purple-600 hover:bg-purple-50 transition-colors" title="Contrato">
              <Scroll className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{isInterestOnly ? 'Interés' : 'Cuota'}</p>
            <p className="text-sm font-bold text-foreground truncate">{formatCurrency(loan.installment_amount)}</p>
          </div>
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">Capital</p>
            <p className="text-sm font-bold text-foreground truncate">{formatCurrency(loan.amount)}</p>
          </div>
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">Pagado</p>
            <p className="text-sm font-bold text-success truncate">{formatCurrency(loan.paid_amount)}</p>
          </div>
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">Mora</p>
            <p className="text-sm font-bold text-destructive truncate">{formatCurrency(calcPendingMora())}</p>
          </div>
          <div className="bg-muted rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">Pendiente</p>
            <p className="text-sm font-bold text-foreground truncate">{formatCurrency(Number(loan.remaining_amount))}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
            {loan.frequency === 'daily' ? 'Diario' : loan.frequency === 'weekly' ? 'Semanal' : loan.frequency === 'biweekly' ? 'Quincenal' : 'Mensual'}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
            {isOpenEnded ? 'Abierto' : `${loan.installments} cuotas`}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
            {isInterestOnly ? 'Solo interés' : 'Francesa'}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
            Tasa: {loan.interest_type === 'percentage' ? `${loan.interest_rate}%` : formatCurrency(loan.interest_rate)}
          </span>
          {loan.guarantee && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
              Garantía: {loan.guarantee}
            </span>
          )}
          {isOpenEnded && loan.payment_day && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/5 text-primary font-medium">
              Día {loan.payment_day}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Progress value={progressValue} className="flex-1" />
          <span className="text-sm text-muted-foreground flex-shrink-0">
            {progressValue}% · {isOpenEnded ? `${formatCurrency(Number(loan.amount) - Number(loan.remaining_amount))}/${formatCurrency(loan.amount)}` : `${loan.paid_installments}/${loan.installments} cuotas`}
          </span>
        </div>

        {(loan.status === 'active' || loan.status.startsWith('late')) && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-border">
            <Button size="sm" onClick={() => {
              setPaymentAmount(isOpenEnded ? String(loan.installment_amount) : '')
              setPaymentInstallmentId('')
              setIncludeMora(true)
              setShowPayment(true)
            }} className="min-h-11 flex-1 sm:flex-none">{isInterestOnly ? 'Pagar intereses' : 'Pagar cuota'}</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowCapitalAbono(true)} className="min-h-11">Abonar</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowLiquidation(true)} className="min-h-11">Liquidar</Button>
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
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Pendientes</p>
                <p className="text-lg font-bold text-foreground">{installments.filter(i => i.status !== 'paid').length}</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Pagadas</p>
                <p className="text-lg font-bold text-success">{installments.filter(i => i.status === 'paid').length}</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Por cobrar</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(installments.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0))}</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Mora total</p>
                <p className="text-lg font-bold text-destructive">{formatCurrency(calcPendingMora())}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {installments.map(inst => {
                const remaining = inst.amount - (inst.paid_amount || 0)
                const paidRatio = inst.paid_amount ? Math.round((inst.paid_amount / inst.amount) * 100) : 0
                const now = new Date()
                const dueDate = new Date(inst.due_date)
                const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
                const isLate = now > dueDate && inst.status !== 'paid'
                const remainingLate = Math.max(0, (inst.late_amount || 0) - (inst.paid_late_amount || 0))
                const cardBorder = inst.status === 'paid' ? 'border-success/30' :
                  inst.status === 'partial' ? 'border-blue-300' :
                  isLate ? 'border-red-300' : 'border-amber-200'
                const cardBg = inst.status === 'paid' ? 'bg-gray-50' :
                  isLate ? 'bg-red-50/40' : ''
                const numBg = inst.status === 'paid' ? 'bg-success/10 text-success' :
                  inst.status === 'partial' ? 'bg-blue-100 text-blue-700' :
                  isLate ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                const badgeLabel = inst.status === 'paid' ? 'Pagado' :
                  inst.status === 'partial' ? 'Parcial' :
                  isLate ? 'Atrasado' : 'Pendiente'
                const badgeVariant: 'paid' | 'active' | 'late' | 'default' = inst.status === 'paid' ? 'paid' :
                  inst.status === 'partial' ? 'active' :
                  isLate ? 'late' : 'active'
                return (
                  <div key={inst.number} className={`rounded-xl border-2 p-4 ${cardBorder} ${cardBg} transition-shadow hover:shadow-sm`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${numBg}`}>
                        {inst.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground">{inst.status === 'paid' ? formatCurrency(inst.amount) : formatCurrency(remaining)}{inst.status === 'partial' && <span className="text-xs text-muted-foreground font-normal ml-1">restantes</span>}</p>
                        <p className="text-xs text-muted-foreground">Vence: {formatDate(inst.due_date)}</p>
                      </div>
                      <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                    </div>
                    {!isInterestOnly && (
                      <div className="flex gap-4 text-xs text-muted-foreground mb-2 px-1">
                        <span>Capital: <strong className="text-foreground">{formatCurrency(inst.capital)}</strong></span>
                        <span>Interés: <strong className="text-foreground">{formatCurrency(inst.interest)}</strong></span>
                        <span>Saldo: <strong className="text-foreground">{formatCurrency(inst.balance)}</strong></span>
                      </div>
                    )}
                    {isInterestOnly && (
                      <div className="flex gap-4 text-xs text-muted-foreground mb-2 px-1">
                        <span>Interés: <strong className="text-foreground">{formatCurrency(inst.interest)}</strong></span>
                        <span>Balance: <strong className="text-foreground">{formatCurrency(inst.balance)}</strong></span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-3 px-1">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          inst.status === 'paid' ? 'bg-success' :
                          paidRatio > 0 ? 'bg-primary' : 'bg-muted'
                        }`} style={{ width: `${paidRatio}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{paidRatio}%</span>
                    </div>
                    {isLate && remainingLate > 0 && (
                      <div className="flex items-center gap-2 text-xs text-destructive font-medium mb-3 px-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                        Mora: {formatCurrency(remainingLate)} ({daysLate} días)
                      </div>
                    )}
                    {inst.status !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentInstallmentId(inst.id)
                          setPaymentAmount(String(remaining))
                          setSelectedPaymentInstallment(inst)
                          const graceDays = settings?.grace_days || 0
                          const ld = calculateLateDays(inst.due_date, graceDays)
                          const totalLate = ld > 0
                            ? calculateLateAmount(remaining > 0 ? remaining : inst.amount, ld, settings?.late_interest_rate || 0.5)
                            : 0
                          const paidLate = inst.paid_late_amount || 0
                          const remainingLateVal = Math.max(0, totalLate - paidLate)
                          setSelectedInstallmentMora(ld > 0 ? { lateDays: ld, lateAmount: remainingLateVal } : null)
                          setIncludeMora(true)
                          setShowPayment(true)
                        }}
                        className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                      >
                        {isInterestOnly ? `Pagar ${formatCurrency(inst.interest)}` : `Pagar ${formatCurrency(remaining)}`}
                      </button>
                    )}
                    {inst.status === 'paid' && (
                      <div className="flex items-center gap-2 text-xs text-success font-medium px-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        Cobrado {inst.paid_at ? formatDate(inst.paid_at) : ''}
                      </div>
                    )}
                    {inst.status === 'partial' && (
                      <div className="flex items-center gap-2 text-xs text-blue-600 font-medium px-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                        Pagado {formatCurrency(inst.paid_amount!)} de {formatCurrency(inst.amount)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">Pagos ({payments.length})</h3>
          {payments.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const total = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0)
                const msg = `📊 *RESUMEN DE PAGOS*\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nTotal pagado: ${formatCurrency(total)}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Mis Préstamos'}`
                const phone = loan.client?.whatsapp || loan.client?.phone
                if (phone) {
                  navigator.clipboard.writeText(msg).then(() => {})
                }
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ver todos
            </button>
          )}
        </div>
        {payments.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-2xl">📭</div>
            <p className="font-medium text-foreground">Sin pagos registrados</p>
            <p className="text-sm text-muted-foreground mt-1">Los pagos aparecerán aquí cuando se registren</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.slice(0, 5).map(p => {
              const methodIcon = p.method === 'cash' ? '💰' : p.method === 'transfer' ? '🏦' : p.method === 'deposit' ? '📥' : '💳'
              const typeLabel = p.type === 'capital_abono' ? 'Abono capital' : p.type === 'liquidation' ? 'Liquidación' : p.type === 'installment' ? 'Interés' : 'Cuota'
              const typeBadgeColor = p.type === 'capital_abono' ? 'bg-purple-100 text-purple-700' :
                p.type === 'liquidation' ? 'bg-green-100 text-green-700' :
                p.type === 'installment' ? 'bg-blue-100 text-blue-700' :
                'bg-muted text-muted-foreground'
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/50 transition-all">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 ${
                    p.method === 'cash' ? 'bg-green-50' : p.method === 'transfer' ? 'bg-blue-50' : p.method === 'deposit' ? 'bg-amber-50' : 'bg-gray-50'
                  }`}>
                    {methodIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-foreground">{formatCurrency(p.amount)}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeBadgeColor}`}>{typeLabel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : p.method === 'deposit' ? 'Depósito' : 'Otro'}
                      {p.notes && ` · ${p.notes}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</p>
                    <div className="flex gap-1 mt-1 justify-end">
                      {p.status === 'paid' && (
                        <>
                          <button onClick={() => {
                            const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(p.amount)}\nFecha: ${formatDate(p.payment_date)}\nMétodo: ${p.method}${p.notes ? `\nNota: ${p.notes}` : ''}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Mis Préstamos'}`
                            const phone = loan.client?.whatsapp || loan.client?.phone
                            if (phone) {
                              window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
                            } else {
                              navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
                            }
                          }} className="w-7 h-7 rounded-md hover:bg-emerald-50 hover:text-emerald-600 flex items-center justify-center transition-colors" title="WhatsApp"><ChatCircle className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleReversePayment(p.id)} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center text-sm transition-colors" title="Reversar">
                            <ArrowCounterClockwise className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                      {p.status !== 'paid' && (
                        <Badge variant="cancelled">Reversado</Badge>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {payments.length > 5 && (
              <button
                type="button"
                onClick={() => {/* could expand */}}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2 transition-colors"
              >
                Ver {payments.length - 5} pagos más →
              </button>
            )}
          </div>
        )}
      </Card>

<BottomSheet open={showPayment} onClose={() => setShowPayment(false)} title={isInterestOnly ? 'Pagar intereses' : 'Realizar pago'}>
        <form onSubmit={handlePayInstallment} className="space-y-4">
        {paymentError && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg animate-in fade-in">{paymentError}</div>
        )}

        {!isOpenEnded && (
          <div className="space-y-1 mb-4">
            <label className="block text-sm font-medium text-muted-foreground mb-2">{isInterestOnly ? 'Cuota de interés a pagar' : 'Seleccionar cuota'}</label>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {installments.filter(i => i.status !== 'paid').map(inst => {
                const remaining = inst.amount - (inst.paid_amount || 0)
                const isPartial = (inst.paid_amount || 0) > 0
                const graceDays = settings?.grace_days || 0
                const lateDays = calculateLateDays(inst.due_date, graceDays)
                const now = new Date()
                const isLate = now > new Date(inst.due_date)
                const isSelected = paymentInstallmentId === inst.id
                let numBg = 'bg-amber-50 text-amber-700'
                let badgeLabel = 'Pendiente'
                let badgeVariant = 'badge-pendiente'
                if (isPartial) { numBg = 'bg-blue-50 text-blue-700'; badgeLabel = 'Parcial'; badgeVariant = 'badge-parcial' }
                if (isLate && !isPartial) { numBg = 'bg-red-50 text-red-700'; badgeLabel = 'Atrasado'; badgeVariant = 'badge-atrasado' }
                return (
                  <label
                    key={inst.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="installment"
                      value={inst.id}
                      checked={isSelected}
                      onChange={() => {
                        setPaymentInstallmentId(inst.id)
                        const totalLate = lateDays > 0
                          ? calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, settings?.late_interest_rate || 0.5)
                          : 0
                        const paidLate = inst.paid_late_amount || 0
                        const remainingLate = Math.max(0, totalLate - paidLate)
                        setPaymentAmount(String(remaining + (includeMora && remainingLate > 0 ? remainingLate : 0)))
                        setSelectedPaymentInstallment(inst)
                        setSelectedInstallmentMora(lateDays > 0 ? { lateDays, lateAmount: remainingLate } : null)
                      }}
                      className="accent-primary h-4 w-4 flex-shrink-0"
                    />
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${numBg}`}>
                      {inst.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground">
                        {isPartial ? formatCurrency(remaining) : formatCurrency(inst.amount)}
                        {isPartial && <span className="text-xs text-muted-foreground font-normal ml-1">restantes</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Vence: {formatDate(inst.due_date)}
                        {isPartial && <> · Pagado {formatCurrency(inst.paid_amount!)}</>}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                      badgeLabel === 'Atrasado' ? 'bg-red-100 text-red-700' :
                      badgeLabel === 'Parcial' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {badgeLabel}
                    </span>
                  </label>
                )
              })}
            </div>
            {installments.filter(i => i.status !== 'paid').length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Todas las cuotas están pagadas</p>
            )}
          </div>
        )}

        {isOpenEnded && (
          <div className="bg-muted rounded-lg p-3 mb-4">
            <p className="text-sm text-muted-foreground">
              Interés del período: <strong className="text-foreground">{formatCurrency(loan.installment_amount)}</strong>
              {nextDueDate && <> · Vence: <strong className="text-foreground">{nextDueDate}</strong></>}
            </p>
          </div>
        )}

        <div className="space-y-1 mb-4">
          <label className="block text-sm font-medium text-muted-foreground">Monto</label>
          <div className="flex gap-2">
            <input
              type="number" step="0.01" value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11"
              required
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => {
              if (selectedPaymentInstallment) {
                const remaining = selectedPaymentInstallment.amount - (selectedPaymentInstallment.paid_amount || 0)
                const mora = includeMora ? (selectedInstallmentMora?.lateAmount || 0) : 0
                setPaymentAmount(String(remaining + mora))
              }
            }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">Completo</button>
            <button type="button" onClick={() => {
              const val = parseFloat(paymentAmount) || 0
              setPaymentAmount(String(Math.round(val / 2 * 100) / 100))
            }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-border transition-colors">Mitad</button>
          </div>
        </div>

        {selectedInstallmentMora && selectedPaymentInstallment && (() => {
          const remaining = selectedPaymentInstallment.amount - (selectedPaymentInstallment.paid_amount || 0)
          const moraAmount = selectedInstallmentMora.lateAmount
          return (
            <div className={`mb-4 transition-all duration-200 ${includeMora ? 'opacity-100' : 'opacity-70'}`}>
              <label className="flex items-center gap-2 text-sm p-3 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={includeMora}
                  onChange={e => {
                    const checked = e.target.checked
                    setIncludeMora(checked)
                    setPaymentAmount(String(checked ? remaining + moraAmount : remaining))
                  }}
                  className="rounded border-border h-4 w-4"
                />
                <span>Incluir mora: <strong>{formatCurrency(moraAmount)}</strong> ({selectedInstallmentMora.lateDays} días)</span>
              </label>

              {includeMora && (
                <div className="mt-2 p-3 rounded-lg bg-muted border border-border animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal cuota</span>
                    <span className="font-medium">{formatCurrency(remaining)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-destructive">Mora ({selectedInstallmentMora.lateDays}d)</span>
                    <span className="font-medium text-destructive">+ {formatCurrency(moraAmount)}</span>
                  </div>
                  <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground">{formatCurrency(remaining + moraAmount)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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

        <div className="mb-4">
          <Input label="Notas" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Referencia del pago" />
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={() => setShowPayment(false)} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">Pagar</Button>
        </div>
        </form>
      </BottomSheet>

      <BottomSheet open={showCapitalAbono} onClose={() => setShowCapitalAbono(false)} title="Abonar al capital">
        <form onSubmit={handleCapitalAbono} className="space-y-4">
          {(() => {
            const capRemaining = calcCapitalRemaining()
            const abono = parseFloat(capitalAbonoAmount) || 0
            const nuevoCapital = Math.max(0, capRemaining - abono)
            return (
              <>
                <div className="bg-primary/5 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Capital actual</span>
                    <span className="font-semibold">{formatCurrency(capRemaining)}</span>
                  </div>
                  {abono > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Abono</span>
                      <span className="font-semibold text-success">- {formatCurrency(abono)}</span>
                    </div>
                  )}
                  <div className="border-t border-primary/10 pt-2 flex justify-between text-sm font-bold">
                    <span>Capital restante</span>
                    <span>{formatCurrency(nuevoCapital)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Las cuotas pendientes se reducirán proporcionalmente
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Monto a abonar</label>
                  <div className="flex gap-2">
                    <input type="number" step="0.01" min="0.01" max={capRemaining}
                      value={capitalAbonoAmount}
                      onChange={e => setCapitalAbonoAmount(e.target.value)}
                      className="block w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm bg-card min-h-11"
                      required />
                    <span className="text-xs text-muted-foreground self-center flex-shrink-0">máx {formatCurrency(capRemaining)}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {[25, 50, 75, 100].map(pct => (
                      <button key={pct} type="button" onClick={() => {
                        setCapitalAbonoAmount(String(Math.round(capRemaining * pct / 100 * 100) / 100))
                      }} className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        Math.abs(abono - capRemaining * pct / 100) < 0.01
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      }`}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
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

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" type="button" onClick={() => setShowCapitalAbono(false)} className="flex-1">Cancelar</Button>
                  <Button type="submit" loading={loading} className="flex-1">
                    {abono > 0 ? `Abonar ${formatCurrency(abono)}` : 'Abonar'}
                  </Button>
                </div>
              </>
            )
          })()}
        </form>
      </BottomSheet>

      <BottomSheet open={showLiquidation} onClose={() => setShowLiquidation(false)} title="Liquidar préstamo">
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
                    <span className="font-bold">Total</span>
                    <span className="font-bold text-foreground">{formatCurrency(total)}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Al liquidar, el préstamo se marcará como pagado.
                </p>
              </div>
            )
          })()}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowLiquidation(false)} className="flex-1">Cancelar</Button>
            <Button onClick={handleLiquidation} loading={loading} className="flex-1">Confirmar liquidación</Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={showContract} onClose={() => setShowContract(false)} title="Contrato de préstamo">
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
      </BottomSheet>

      <BottomSheet open={showDocs} onClose={() => setShowDocs(false)} title="Documentos del préstamo">
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
      </BottomSheet>

      <BottomSheet open={showSuccess} onClose={() => setShowSuccess(false)} title="Pago exitoso">
        <div className="text-center space-y-5 py-2">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-xl font-semibold text-foreground">Pago registrado correctamente</p>
          <div className="bg-muted rounded-lg p-4 text-left space-y-1.5 text-sm">
            <p className="flex justify-between"><span className="text-muted-foreground">Monto:</span> <strong>{formatCurrency(successPayment?.amount || 0)}</strong></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Fecha:</span> <strong>{formatDate(successPayment?.payment_date || paymentDate)}</strong></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Método:</span> <strong>{paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'transfer' ? 'Transferencia' : paymentMethod === 'deposit' ? 'Depósito' : 'Otro'}</strong></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Pendiente:</span> <strong>{formatCurrency(loan.remaining_amount)}</strong></p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
              <FileArrowDown className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              const actualDate = successPayment?.payment_date || paymentDate
              const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(successPayment?.amount || 0)}\nFecha: ${formatDate(actualDate)}\nMétodo: ${paymentMethod}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Mis Préstamos'}`
              const phone = loan.client?.whatsapp || loan.client?.phone
              if (phone) {
                window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
              } else {
                navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
              }
            }}>
              <ChatCircle className="h-4 w-4 mr-1" /> WhatsApp
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              const actualDate = successPayment?.payment_date || paymentDate
              const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(successPayment?.amount || 0)}\nFecha: ${formatDate(actualDate)}\nMétodo: ${paymentMethod}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Mis Préstamos'}`
              navigator.clipboard.writeText(msg).then(() => alert('Recibo copiado al portapapeles'))
            }}>
              <ShareNetwork className="h-4 w-4 mr-1" /> Compartir
            </Button>
          </div>
          <Button className="w-full" onClick={() => setShowSuccess(false)}>Cerrar</Button>
        </div>
      </BottomSheet>
    </div>
  )
}
