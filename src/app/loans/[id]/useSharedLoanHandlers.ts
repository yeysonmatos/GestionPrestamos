import type { LoanHandlerInput } from './loan-handler.types'
import { calculateLateDays, calculateLateAmount, calculateProportionalInterest } from '@/lib/calculations'
import { updateLoanAfterPayment } from '@/lib/payments'
import { logAuditEvent } from '@/lib/audit'

export function useSharedLoanHandlers({ state, setters, services }: LoanHandlerInput) {
  const { supabase, userId, settings, router } = services

  const handlePayInstallment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state.loading) return
    if (state.loan.open_ended) {
      setters.setLoading(true)
      setters.setPaymentError('')
      const amount = parseFloat(state.paymentAmount)
      if (isNaN(amount) || amount <= 0) { setters.setPaymentError('Monto inválido'); setters.setLoading(false); return }
      const { data: payment, error } = await supabase.from('payments').insert({
        loan_id: state.loan.id, client_id: state.loan.client_id, user_id: userId,
        amount, capital_amount: 0, interest_amount: amount,
        payment_date: state.paymentDate, method: state.paymentMethod,
        notes: state.paymentNotes || null, type: 'installment',
      }).select().single()
      if (error) { setters.setPaymentError('Error al registrar pago: ' + error.message); setters.setLoading(false); return }
      await updateLoanAfterPayment(supabase, state.loan.id, state.loan.client_id)
      setters.setPayments(prev => [payment, ...prev])
      setters.setSuccessPayment(payment)
      setters.setShowPayment(false)
      setters.setShowSuccess(true)
      setters.setPaymentInstallmentId('')
      setters.setPaymentAmount('')
      setters.setPaymentNotes('')
      setters.setIncludeMora(true)
      setters.setSelectedInstallmentMora(null)
      setters.setSelectedPaymentInstallment(null)
      router.refresh()
      setters.setLoading(false)
      return
    }
    if (!state.paymentInstallmentId || !userId) return
    const inst = state.installments.find(i => i.id === state.paymentInstallmentId)
    if (!inst) return
    setters.setLoading(true)
    setters.setPaymentError('')
    const amount = parseFloat(state.paymentAmount)
    if (isNaN(amount) || amount <= 0) { setters.setPaymentError('Monto inválido'); setters.setLoading(false); return }
    try {
      const graceDays = settings?.grace_days || 0
      const lateRate = settings?.late_interest_rate || 0.5

      const { data: rpcResult, error: rpcError } = await supabase.rpc('process_installment_payment', {
        p_loan_id: state.loan.id,
        p_installment_id: inst.id,
        p_user_id: userId,
        p_amount: amount,
        p_include_mora: state.includeMora,
        p_payment_date: state.paymentDate,
        p_method: state.paymentMethod,
        p_notes: state.paymentNotes,
        p_late_interest_rate: lateRate,
        p_grace_days: graceDays,
      })
      if (rpcError) throw new Error(`Error al procesar el pago: ${rpcError.message}`)
      if (!rpcResult?.ok) throw new Error(rpcResult?.error || 'Error al procesar el pago')

      const payment = rpcResult.payment
      const allocation = rpcResult.allocation
      const loanUpdates = rpcResult.loan

      const newStatus = allocation.isNowFullyPaid ? 'paid' as const : allocation.totalPaidOnInstallment > 0 ? 'partial' as const : 'pending' as const
      setters.setInstallments(prev => prev.map(i => i.id === inst.id
        ? { ...i, status: newStatus, paid_amount: allocation.totalPaidOnInstallment, paid_late_amount: allocation.newPaidLateAmount, late_amount: allocation.totalLateAmount, late_days: allocation.lateDays, paid_at: allocation.isNowFullyPaid ? state.paymentDate : null }
        : i))
      setters.setPayments(prev => [payment, ...prev])
      setters.setLoan(prev => ({
        ...prev,
        paid_amount: loanUpdates.paid_amount ?? prev.paid_amount,
        remaining_amount: loanUpdates.remaining_amount ?? prev.remaining_amount,
        progress: loanUpdates.progress ?? prev.progress,
        paid_installments: loanUpdates.paid_installments ?? prev.paid_installments,
        status: loanUpdates.status ?? prev.status,
        prepaid_balance: allocation.newPrepaidBalance,
      }))
      setters.setSuccessPayment(payment)
      setters.setShowPayment(false)
      setters.setShowSuccess(true)
      setters.setPaymentInstallmentId('')
      setters.setPaymentAmount('')
      setters.setPaymentNotes('')
      setters.setIncludeMora(true)
      setters.setSelectedInstallmentMora(null)
      setters.setSelectedPaymentInstallment(null)
      router.refresh()
    } catch (err) {
      setters.setPaymentError(err instanceof Error ? err.message : 'Error al procesar el pago')
    }
    setters.setLoading(false)
  }

  const handleLiquidation = async () => {
    if (state.loading) return
    if (!userId) return
    setters.setLoading(true)
    const paidCapital = state.payments.filter(p => p.status === 'paid' && Number(p.capital_amount) > 0).reduce((s, p) => s + Number(p.capital_amount), 0)
    const capRemaining = Math.max(0, Number(state.loan.amount) - paidCapital)
    const graceDays = settings?.grace_days || 0
    const lateRate = settings?.late_interest_rate || 0.5
    let totalMora = 0
    for (const inst of state.installments) {
      if (inst.status === 'paid') continue
      const remaining = inst.amount - (inst.paid_amount || 0)
      const lateDays = calculateLateDays(inst.due_date, graceDays)
      if (lateDays > 0) {
        const totalLate = calculateLateAmount(Math.max(remaining, 0.01), lateDays, lateRate)
        const paidLate = inst.paid_late_amount || 0
        totalMora += Math.max(0, totalLate - paidLate)
      }
    }
    const lastPayment = state.payments.filter(p => p.status === 'paid').sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]
    const lastDate = lastPayment?.payment_date || state.loan.first_payment_date
    const days = Math.max(0, Math.floor((new Date().getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)))
    const monthlyRate = state.loan.interest_type === 'percentage' ? state.loan.interest_rate / 100 : 0
    const propInterest = monthlyRate > 0 ? calculateProportionalInterest(capRemaining, monthlyRate, days) : 0
    const total = capRemaining + propInterest + totalMora
    const { data: payment, error } = await supabase.from('payments').insert({
      loan_id: state.loan.id, client_id: state.loan.client_id, user_id: userId,
      amount: total, capital_amount: capRemaining, interest_amount: propInterest, late_amount: totalMora,
      payment_date: state.paymentDate, method: state.paymentMethod,
      notes: state.paymentNotes || 'Liquidación total', type: 'liquidation',
    }).select().single()
    if (error) { setters.setPaymentError('Error al liquidar: ' + error.message); setters.setLoading(false); return }
    logAuditEvent(supabase, { userId, action: 'loan.liquidated', entityType: 'loan', entityId: state.loan.id, details: { client_id: state.loan.client_id, amount: total, capital_amount: capRemaining, interest_amount: propInterest, late_amount: totalMora } })
    await supabase.from('loans').update({ status: 'paid', paid_amount: Number(state.loan.amount), remaining_amount: 0, paid_installments: state.loan.installments, progress: 100 }).eq('id', state.loan.id)
    for (const inst of state.installments) {
      if (inst.status !== 'paid') {
        await supabase.from('installments').update({ status: 'paid', paid_amount: inst.amount, paid_late_amount: inst.late_amount || 0, paid_at: state.paymentDate }).eq('id', inst.id)
      }
    }
    await supabase.rpc('update_client_stats', { p_client_id: state.loan.client_id })
    setters.setPayments(prev => [payment, ...prev])
    setters.setLoan(prev => ({ ...prev, status: 'paid', paid_amount: Number(state.loan.amount), remaining_amount: 0, progress: 100 }))
    setters.setInstallments(prev => prev.map(i => i.status !== 'paid' ? { ...i, status: 'paid', paid_amount: i.amount, paid_at: state.paymentDate } : i))
    setters.setShowLiquidation(false)
    router.refresh()
    setters.setLoading(false)
  }

  return { handlePayInstallment, handleLiquidation }
}
