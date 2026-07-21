'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { calculateLoan, calculateProportionalInterest, recalculateFrenchSchedule } from '@/lib/calculations'
import { calculateLateDays, calculateLateAmount } from '@/lib/calculations'
import { updateLoanAfterPayment, recalculateInstallment } from '@/lib/payments'
import PaymentReceipt from '@/components/loans/PaymentReceipt'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Progress } from '@/components/ui/Progress'
import BottomSheet from '@/components/ui/BottomSheet'
import {
  ArrowLeft, ChatCircle, FileText, Scroll, ArrowCounterClockwise,
  Check, FileArrowDown, ShareNetwork, X, Plus,
} from '@phosphor-icons/react'
import type { Loan, Installment, Payment, Setting, Client } from '@/types'

interface Props {
  loan: Loan
  installments: Installment[]
  payments: Payment[]
  settings: Setting | null
}

export default function LoanDetail({ loan: initialLoan, installments: initialInstallments, payments: initialPayments, settings }: Props) {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [loan, setLoan] = useState<Loan>(initialLoan)
  const [installments, setInstallments] = useState<Installment[]>(initialInstallments)
  const [payments, setPayments] = useState<Payment[]>(initialPayments)
  const [showPayment, setShowPayment] = useState(false)
  const [showCapitalAbono, setShowCapitalAbono] = useState(false)
  const [showLiquidation, setShowLiquidation] = useState(false)
  const [showContract, setShowContract] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successPayment, setSuccessPayment] = useState<Payment | null>(null)
  const [docs, setDocs] = useState<Array<{id: string; name: string; type: string; path: string}>>([])
  const [loading, setLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'deposit' | 'other'>('cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [paymentInstallmentId, setPaymentInstallmentId] = useState<string>('')
  const [includeMora, setIncludeMora] = useState(true)
  const [selectedInstallmentMora, setSelectedInstallmentMora] = useState<{ lateDays: number; lateAmount: number } | null>(null)
  const [selectedPaymentInstallment, setSelectedPaymentInstallment] = useState<Installment | null>(null)
  const [capitalAbonoAmount, setCapitalAbonoAmount] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id)
    })
  }, [supabase])

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('id, name, type, path')
      .eq('loan_id', loan.id)
      .order('created_at', { ascending: false })
    if (data) setDocs(data)
  }, [loan.id, supabase])

  useEffect(() => { loadDocs() }, [loadDocs])

  const isOpenEnded = loan.open_ended
  const isInterestOnly = loan.amortization_type === 'interest_only'

  const statusVariant: Record<string, 'paid' | 'active' | 'late' | 'late_1_30' | 'late_31_60' | 'late_61_90' | 'default'> = {
    active: 'active',
    paid: 'paid',
    late: 'late',
    late_1_30: 'late_1_30',
    late_31_60: 'late_31_60',
    late_61_90: 'late_61_90',
  }

  const getStatusLabel = (status: string) => {
    if (status === 'active') return 'Activo'
    if (status === 'paid') return 'Pagado'
    if (status.startsWith('late')) return `Atrasado ${status.split('_')[1] || ''}`.trim()
    return status
  }

  const calcPendingMora = () => {
    const graceDays = settings?.grace_days || 0
    const lateRate = settings?.late_interest_rate || 0.5
    let total = 0
    for (const inst of installments) {
      if (inst.status === 'paid') continue
      const remaining = inst.amount - (inst.paid_amount || 0)
      const lateDays = calculateLateDays(inst.due_date, graceDays)
      if (lateDays > 0) {
        const totalLate = calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, lateRate)
        const paidLate = inst.paid_late_amount || 0
        total += Math.max(0, totalLate - paidLate)
      }
    }
    return total
  }

  const calcCapitalRemaining = () => {
    const paidCapital = payments
      .filter(p => p.status === 'paid' && Number(p.capital_amount) > 0)
      .reduce((s, p) => s + Number(p.capital_amount), 0)
    return Math.max(0, Number(loan.amount) - paidCapital)
  }


  const handlePayInstallment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentInstallmentId || !userId) return
    const inst = installments.find(i => i.id === paymentInstallmentId)
    if (!inst) return

    setLoading(true)
    setPaymentError('')

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) { setPaymentError('Monto inválido'); setLoading(false); return }

    try {
      const remaining = inst.amount - (inst.paid_amount || 0)
      const lateDays = calculateLateDays(inst.due_date, settings?.grace_days || 0)
      const totalLateAmount = lateDays > 0 ? calculateLateAmount(remaining > 0 ? remaining : inst.amount, lateDays, settings?.late_interest_rate || 0.5) : 0
      const paidLateAmount = inst.paid_late_amount || 0
      const remainingLateAmount = Math.max(0, totalLateAmount - paidLateAmount)

      const paidToInstallment = Math.min(amount, remaining)
      const paidToLate = Math.max(0, amount - paidToInstallment)
      const newPaidInstallment = (inst.paid_amount || 0) + paidToInstallment
      const newPaidLate = paidLateAmount + paidToLate
      const payInterestAmount = Math.min(paidToInstallment, inst.interest)
      const payCapitalAmount = Math.max(0, paidToInstallment - payInterestAmount)

      const isNowFullyPaid = newPaidInstallment >= inst.amount - 0.005

      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .insert({
          loan_id: loan.id,
          client_id: loan.client_id,
          installment_id: inst.id,
          user_id: userId,
          amount,
          capital_amount: payCapitalAmount,
          interest_amount: payInterestAmount,
          late_amount: paidToLate,
          payment_date: paymentDate,
          method: paymentMethod,
          notes: paymentNotes || null,
          type: isInterestOnly ? 'installment' : 'installment',
        })
        .select()
        .single()

      if (payErr) throw payErr

      await supabase.from('installments').update({
        status: isNowFullyPaid ? 'paid' : newPaidInstallment > 0 ? 'partial' : (lateDays > 0 ? 'late' : 'pending'),
        paid_amount: newPaidInstallment,
        paid_late_amount: newPaidLate,
        late_amount: totalLateAmount,
        late_days: lateDays,
        paid_at: isNowFullyPaid ? paymentDate : null,
      }).eq('id', inst.id)

      const newPaidAmount = Number(loan.paid_amount) + amount
      const newRemaining = Math.max(0, Number(loan.remaining_amount) - payCapitalAmount)
      await supabase.from('loans').update({ paid_amount: newPaidAmount, remaining_amount: newRemaining }).eq('id', loan.id)

      const loanUpdates = await updateLoanAfterPayment(supabase as any, loan.id, loan.client_id)

      setInstallments(prev => prev.map(i => i.id === inst.id
        ? { ...i, status: isNowFullyPaid ? 'paid' : newPaidInstallment > 0 ? 'partial' : (lateDays > 0 ? 'late' : 'pending'), paid_amount: newPaidInstallment, paid_late_amount: newPaidLate, late_amount: remainingLateAmount, late_days: lateDays, paid_at: isNowFullyPaid ? paymentDate : null }
        : i))
      setPayments(prev => [payment, ...prev])
      setLoan(prev => ({ ...prev, paid_amount: newPaidAmount, remaining_amount: newRemaining, progress: loanUpdates.progress ?? prev.progress, paid_installments: loanUpdates.paid_installments ?? prev.paid_installments, status: loanUpdates.status ?? prev.status }))

      setSuccessPayment(payment)
      setShowPayment(false)
      setShowSuccess(true)
      setPaymentInstallmentId('')
      setPaymentAmount('')
      setPaymentNotes('')
      setIncludeMora(true)
      setSelectedInstallmentMora(null)
      setSelectedPaymentInstallment(null)
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Error al procesar el pago')
    }
    setLoading(false)
  }

  const handleCapitalAbono = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    const amount = parseFloat(capitalAbonoAmount)
    if (isNaN(amount) || amount <= 0) return

    setLoading(true)

    const { data: existingCapitalPayments } = await supabase
      .from('payments')
      .select('capital_amount')
      .eq('loan_id', loan.id)
      .eq('status', 'paid')
    const existingCapitalPaid = existingCapitalPayments?.reduce((s, p) => s + Number(p.capital_amount), 0) || 0

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
        notes: paymentNotes || null,
        type: 'capital_abono',
      })
      .select()
      .single()

    if (error) { setLoading(false); return }

    const newPaid = Number(loan.paid_amount) + amount
    const newContractualRemaining = Math.max(0, Number(loan.remaining_amount) - amount)
    const loanUpdates: Record<string, string | number | boolean | null> = { paid_amount: newPaid, remaining_amount: newContractualRemaining }

    if (loan.amortization_type === 'interest_only' && loan.installment_amount && newContractualRemaining > 0) {
      const periodicRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
      const capitalRemainingForInterest = Math.max(0, Number(loan.amount) - existingCapitalPaid - amount)
      const newInstallmentAmount = capitalRemainingForInterest * periodicRate
      loanUpdates.installment_amount = newInstallmentAmount
      const pendingInsts = installments.filter(i => i.status === 'pending')
      const lastPendingNum = Math.max(...pendingInsts.map(i => i.number))
      for (const inst of pendingInsts) {
        const isLast = inst.number === lastPendingNum
        await supabase.from('installments').update({
          amount: newInstallmentAmount,
          interest: newInstallmentAmount,
          capital: isLast ? capitalRemainingForInterest : 0,
          balance: isLast ? 0 : capitalRemainingForInterest,
        }).eq('id', inst.id)
      }
      setInstallments(prev => prev.map(i =>
        i.status === 'pending' ? {
          ...i,
          amount: newInstallmentAmount,
          interest: newInstallmentAmount,
          capital: i.number === lastPendingNum ? capitalRemainingForInterest : 0,
          balance: i.number === lastPendingNum ? 0 : capitalRemainingForInterest,
        } : i
      ))
    }

    if (loan.amortization_type === 'french' && newContractualRemaining > 0) {
      const paidInstallmentsCount = installments.filter(i => i.status === 'paid').length
      const capitalRemaining = Math.max(0, Number(loan.amount) - existingCapitalPaid - amount)
      const remainingCount = loan.installments - paidInstallmentsCount
      if (remainingCount > 0) {
        const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
        const DAYS_IN_PERIOD: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }
        const days = DAYS_IN_PERIOD[loan.frequency] || 30
        const periodicRate = monthlyRate / 30 * days
        const startAt = paidInstallmentsCount + 1

        const recalculated = recalculateFrenchSchedule(capitalRemaining, remainingCount, periodicRate, loan.first_payment_date, loan.frequency, startAt)

        for (const row of recalculated.installments) {
          await supabase.from('installments').update({
            amount: row.amount,
            capital: row.capital,
            interest: row.interest,
            balance: row.balance,
          }).eq('loan_id', loan.id).eq('number', row.number)
        }

        const oldPaidTotal = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
        const newTotalAmount = recalculated.total_amount + oldPaidTotal
        const oldPaidInterest = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.interest || 0), 0)
        const newTotalInterest = recalculated.total_interest + oldPaidInterest

        loanUpdates.installment_amount = recalculated.installment_amount
        loanUpdates.total_amount = newTotalAmount
        loanUpdates.total_interest = newTotalInterest
      }
    }

    await supabase.from('loans').update(loanUpdates).eq('id', loan.id)
    const loanResult = await updateLoanAfterPayment(supabase as any, loan.id, loan.client_id)

    setPayments(prev => [payment, ...prev])
    setLoan(prev => ({
      ...prev,
      paid_amount: newPaid,
      remaining_amount: newContractualRemaining,
      installment_amount: (loanUpdates.installment_amount as number) ?? prev.installment_amount,
      total_amount: (loanUpdates.total_amount as number) ?? prev.total_amount,
      total_interest: (loanUpdates.total_interest as number) ?? prev.total_interest,
      progress: loanResult.progress ?? prev.progress,
      paid_installments: loanResult.paid_installments ?? prev.paid_installments,
      status: loanResult.status ?? prev.status,
    }))

    const refreshedInsts = await supabase.from('installments').select('*').eq('loan_id', loan.id).order('number')
    if (refreshedInsts.data) setInstallments(refreshedInsts.data as Installment[])

    setShowCapitalAbono(false)
    setCapitalAbonoAmount('')
    setLoading(false)
  }

  const handleLiquidation = async () => {
    if (!userId) return
    setLoading(true)

    const capRemaining = calcCapitalRemaining()
    const lastPayment = payments.filter(p => p.status === 'paid').sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]
    const lastDate = lastPayment?.payment_date || loan.first_payment_date
    const days = Math.max(0, Math.floor((new Date().getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)))
    const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
    const propInterest = monthlyRate > 0 ? calculateProportionalInterest(capRemaining, monthlyRate, days) : 0
    const mora = calcPendingMora()
    const total = capRemaining + propInterest + mora

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        loan_id: loan.id,
        client_id: loan.client_id,
        user_id: userId,
        amount: total,
        capital_amount: capRemaining,
        interest_amount: propInterest,
        late_amount: mora,
        payment_date: paymentDate,
        method: paymentMethod,
        notes: paymentNotes || 'Liquidación total',
        type: 'liquidation',
      })
      .select()
      .single()

    if (error) { setLoading(false); return }

    await supabase.from('loans').update({
      status: 'paid',
      paid_amount: Number(loan.amount),
      remaining_amount: 0,
      paid_installments: loan.installments,
      progress: 100,
    }).eq('id', loan.id)

    for (const inst of installments) {
      if (inst.status !== 'paid') {
        await supabase.from('installments').update({ status: 'paid', paid_amount: inst.amount, paid_late_amount: inst.late_amount || 0, paid_at: paymentDate }).eq('id', inst.id)
      }
    }

    await supabase.rpc('update_client_stats', { p_client_id: loan.client_id })

    setPayments(prev => [payment, ...prev])
    setLoan(prev => ({ ...prev, status: 'paid', paid_amount: Number(loan.amount), remaining_amount: 0, progress: 100 }))
    setInstallments(prev => prev.map(i => i.status !== 'paid' ? { ...i, status: 'paid', paid_amount: i.amount, paid_at: paymentDate } : i))
    setShowLiquidation(false)
    setLoading(false)
  }

  const handleReversePayment = async (paymentId: string) => {
    const payment = payments.find(p => p.id === paymentId)
    if (!payment || payment.status !== 'paid') return
    const reason = prompt('Motivo de la reversión:')
    if (!reason) return

    setLoading(true)

    let reversalLoanUpdates: Record<string, number> = {}

    await supabase.from('payments').update({ status: 'reversed', reversal_reason: reason }).eq('id', paymentId)

    const newPaid = Math.max(0, Number(loan.paid_amount) - Number(payment.amount))
    const paidCapital = Number(payment.capital_amount || 0)
    const newRemaining = Math.max(0, Number(loan.remaining_amount) + paidCapital)
    await supabase.from('loans').update({ paid_amount: newPaid, remaining_amount: newRemaining }).eq('id', loan.id)

    if (payment.installment_id) {
      const updated = await recalculateInstallment(supabase as any, payment.installment_id)
      setInstallments(prev => prev.map(i => i.id === payment.installment_id ? { ...i, ...updated } as Installment : i))
    } else if (payment.type === 'liquidation') {
      for (const inst of installments) {
        const updated = await recalculateInstallment(supabase as any, inst.id)
        setInstallments(prev => prev.map(i => i.id === inst.id ? { ...i, ...updated } as Installment : i))
      }
    } else if (payment.type === 'capital_abono' && newRemaining > 0) {
      const paidCount = installments.filter(i => i.status === 'paid').length
      const remainingCount = loan.installments - paidCount
      const paidCapitalViaInstallments = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.capital), 0)
      const totalPaidAbonoCapital = payments
        .filter(p => p.type === 'capital_abono' && p.status === 'paid')
        .reduce((s, p) => s + Number(p.capital_amount), 0)
      const reversalCapitalRemaining = Math.max(0, Number(loan.amount) - paidCapitalViaInstallments - totalPaidAbonoCapital + Number(payment.capital_amount))
      if (loan.amortization_type === 'french' && remainingCount > 0) {
        const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
        const DAYS_IN_PERIOD: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }
        const days = DAYS_IN_PERIOD[loan.frequency] || 30
        const periodicRate = monthlyRate / 30 * days
        const recalculated = recalculateFrenchSchedule(reversalCapitalRemaining, remainingCount, periodicRate, loan.first_payment_date, loan.frequency, paidCount + 1)
        for (const row of recalculated.installments) {
          await supabase.from('installments').update({
            amount: row.amount, capital: row.capital, interest: row.interest, balance: row.balance,
          }).eq('loan_id', loan.id).eq('number', row.number)
        }
        setInstallments(prev => prev.map(i => {
          const r = recalculated.installments.find(r => r.number === i.number)
          return r ? { ...i, amount: r.amount, capital: r.capital, interest: r.interest, balance: r.balance } : i
        }))
        const oldPaidTotal = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
        const newTotalAmount = recalculated.total_amount + oldPaidTotal
        const oldPaidInterest = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.interest || 0), 0)
        const newTotalInterest = recalculated.total_interest + oldPaidInterest
        await supabase.from('loans').update({
          installment_amount: recalculated.installment_amount,
          total_amount: newTotalAmount,
          total_interest: newTotalInterest,
        }).eq('id', loan.id)
        reversalLoanUpdates.installment_amount = recalculated.installment_amount
        reversalLoanUpdates.total_amount = newTotalAmount
        reversalLoanUpdates.total_interest = newTotalInterest
      }
      if (loan.amortization_type === 'interest_only') {
        const periodicRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
        const newInstallmentAmount = newRemaining * periodicRate
        const pendingInsts = installments.filter(i => i.status === 'pending')
        const lastPendingNum = Math.max(...pendingInsts.map(i => i.number))
        const originalBalance = Math.max(0, newRemaining)
        for (const inst of pendingInsts) {
          const isLast = inst.number === lastPendingNum
          await supabase.from('installments').update({
            amount: newInstallmentAmount,
            interest: newInstallmentAmount,
            capital: isLast ? originalBalance : 0,
            balance: isLast ? 0 : originalBalance,
          }).eq('id', inst.id)
        }
        await supabase.from('loans').update({ installment_amount: newInstallmentAmount }).eq('id', loan.id)
        setInstallments(prev => prev.map(i =>
          i.status === 'pending' ? {
            ...i,
            amount: newInstallmentAmount,
            interest: newInstallmentAmount,
            capital: i.number === lastPendingNum ? originalBalance : 0,
            balance: i.number === lastPendingNum ? 0 : originalBalance,
          } : i
        ))
      }
    }

    const loanUpdates = await updateLoanAfterPayment(supabase as any, loan.id, loan.client_id)
    if (payment.type === 'capital_abono') {
      await supabase.from('loans').update({ remaining_amount: newRemaining, paid_amount: newPaid, status: 'active' }).eq('id', loan.id)
      loanUpdates.remaining_amount = newRemaining
      loanUpdates.paid_amount = newPaid
      loanUpdates.status = 'active'
    } else if (loanUpdates.progress !== undefined && loanUpdates.progress < 100) {
      await supabase.from('loans').update({ status: 'active' }).eq('id', loan.id)
      loanUpdates.status = 'active'
    }

    setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'reversed', reversal_reason: reason } : p))
    setLoan(prev => ({ ...prev, paid_amount: newPaid, remaining_amount: newRemaining, progress: loanUpdates.progress ?? prev.progress, paid_installments: loanUpdates.paid_installments ?? prev.paid_installments, status: loanUpdates.status ?? prev.status, installment_amount: reversalLoanUpdates.installment_amount ?? prev.installment_amount, total_amount: reversalLoanUpdates.total_amount ?? prev.total_amount, total_interest: reversalLoanUpdates.total_interest ?? prev.total_interest }))
    setLoading(false)
  }

  const progressValue = isOpenEnded
    ? Math.round(((Number(loan.amount) - Number(loan.remaining_amount)) / Number(loan.amount)) * 100)
    : (loan.progress > 0 ? loan.progress : (installments.length > 0 ? Math.round((installments.filter(i => i.status === 'paid').length / installments.length) * 100) : 0))

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
                        {`Pagar ${formatCurrency(remaining)}`}
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
                const msg = `📊 *RESUMEN DE PAGOS*\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nTotal pagado: ${formatCurrency(total)}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Gestor de Prestamos'}`
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
                    <p className="font-semibold text-sm text-foreground">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${typeColor}`}>{typeLabel}</span>
                      <span className="truncate">{p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : p.method === 'deposit' ? 'Depósito' : 'Otro'}{p.notes ? ` · ${p.notes}` : ''}</span>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-1">
                    <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</p>
                    <div className="flex gap-1 mt-1 justify-end">
                      {p.status === 'paid' && (
                        <>
                          <button onClick={() => {
                            const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(p.amount)}\nFecha: ${formatDate(p.payment_date)}\nMétodo: ${p.method}${p.notes ? `\nNota: ${p.notes}` : ''}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Gestor de Prestamos'}`
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

      <BottomSheet open={showPayment} onClose={() => { setShowPayment(false); setPaymentInstallmentId(''); setSelectedInstallmentMora(null) }} title={isInterestOnly ? 'Pagar intereses' : 'Realizar pago'}>
        <form onSubmit={handlePayInstallment} className="space-y-4">
        {paymentError && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{paymentError}</div>
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
                let badgeBg = 'bg-amber-100 text-amber-700'
                if (isPartial) { numBg = 'bg-blue-50 text-blue-700'; badgeLabel = 'Parcial'; badgeBg = 'bg-blue-100 text-blue-700' }
                if (isLate && !isPartial) { numBg = 'bg-red-50 text-red-700'; badgeLabel = 'Atrasado'; badgeBg = 'bg-red-100 text-red-700' }
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
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badgeBg}`}>
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
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal cuota</span><span className="font-medium">{formatCurrency(remaining)}</span></div>
                  <div className="flex justify-between text-sm mt-1"><span className="text-destructive">Mora ({selectedInstallmentMora.lateDays}d)</span><span className="font-medium text-destructive">+ {formatCurrency(moraAmount)}</span></div>
                  <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold"><span className="text-foreground">Total</span><span className="text-foreground">{formatCurrency(remaining + moraAmount)}</span></div>
                </div>
              )}
            </div>
          )
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Método</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}
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
          <Button variant="secondary" type="button" onClick={() => { setShowPayment(false); setPaymentInstallmentId(''); setSelectedInstallmentMora(null) }} className="flex-1">Cancelar</Button>
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
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}
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

          {successPayment && (
            <div className="border border-border rounded-xl overflow-hidden">
              <PaymentReceipt
                payment={successPayment}
                loan={loan}
                settings={settings}
                previousBalance={Number(loan.remaining_amount) + Number(successPayment.amount)}
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
              <FileArrowDown className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => {
              const actualDate = successPayment?.payment_date || paymentDate
              const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(successPayment?.amount || 0)}\nFecha: ${formatDate(actualDate)}\nMétodo: ${paymentMethod}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Gestor de Prestamos'}`
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
              const msg = `🧾 RECIBO DE PAGO\n\nPréstamo: ${loan.loan_id}\nCliente: ${loan.client?.name}\nMonto: ${formatCurrency(successPayment?.amount || 0)}\nFecha: ${formatDate(actualDate)}\nMétodo: ${paymentMethod}\nPendiente: ${formatCurrency(loan.remaining_amount)}\n\n${settings?.business_name || 'Gestor de Prestamos'}`
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