import type { LoanHandlerInput, LoanRebalanceStrategies } from './loan-handler.types'
import type { Loan, Payment } from '@/types'
import { calculateLateDays, calculateLateAmount, calculateProportionalInterest } from '@/lib/calculations'
import { updateLoanAfterPayment, recalculateInstallment } from '@/lib/payments'
import { logAuditEvent } from '@/lib/audit'

export function useSharedLoanHandlers(input: LoanHandlerInput, strategies: LoanRebalanceStrategies) {
  const { state, setters, services } = input
  const { supabase, userId, settings, router } = services
  const { rebalanceCapitalAbono, rebalanceReverseAbono } = strategies

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
      logAuditEvent(supabase, { userId, action: 'payment.recorded', entityType: 'payment', entityId: payment.id, details: { loan_id: state.loan.loan_id, client_name: state.loan.client?.name, amount, type: 'interest_only' } })
      await updateLoanAfterPayment(supabase, state.loan.id, state.loan.client_id)
      setters.setPayments(prev => [payment, ...prev])
      setters.setSuccessPayment(payment)
      setters.setSuccessPayments([payment])
      setters.setSuccessCoveredCount(1)
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
      const lateRate = settings?.late_interest_rate ?? 0

      const { data: rpcResult, error: rpcError } = await supabase.rpc('process_cascade_payment', {
        p_loan_id: state.loan.id,
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

      const payments: Payment[] = rpcResult.payments || []
      const loanUpdates = rpcResult.loan
      const coveredCount = Number(rpcResult.coveredCount || 1)

      for (const p of payments) {
        logAuditEvent(supabase, { userId, action: 'payment.recorded', entityType: 'payment', entityId: p.id, details: { loan_id: state.loan.loan_id, client_name: state.loan.client?.name, installment_id: p.installment_id || null, amount: Number(p.amount), late_amount: Number(p.late_amount || 0) } })
      }

      setters.setPayments(prev => [...payments, ...prev])
      setters.setLoan(prev => ({
        ...prev,
        paid_amount: loanUpdates.paid_amount ?? prev.paid_amount,
        remaining_amount: loanUpdates.remaining_amount ?? prev.remaining_amount,
        progress: loanUpdates.progress ?? prev.progress,
        paid_installments: loanUpdates.paid_installments ?? prev.paid_installments,
        status: loanUpdates.status ?? prev.status,
        prepaid_balance: Number(rpcResult.newPrepaidBalance ?? prev.prepaid_balance),
        paid_at: loanUpdates.paid_at ?? prev.paid_at,
      }))

      const refreshedInsts = await supabase.from('installments').select('*').eq('loan_id', state.loan.id).order('number')
      if (refreshedInsts.data) setters.setInstallments(refreshedInsts.data)

      setters.setSuccessPayment(payments[payments.length - 1] || payments[0] || null)
      setters.setSuccessPayments(payments)
      setters.setSuccessCoveredCount(coveredCount)
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
    const lateRate = settings?.late_interest_rate ?? 0
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
    logAuditEvent(supabase, { userId, action: 'loan.liquidated', entityType: 'loan', entityId: state.loan.id, details: { loan_id: state.loan.loan_id, client_id: state.loan.client_id, client_name: state.loan.client?.name, amount: total, capital_amount: capRemaining, interest_amount: propInterest, late_amount: totalMora } })
    for (const inst of state.installments) {
      if (inst.status !== 'paid') {
        await supabase.from('installments').update({ status: 'paid', paid_amount: inst.amount, paid_late_amount: inst.late_amount || 0, paid_at: state.paymentDate }).eq('id', inst.id)
      }
    }
    const loanUpdates = await updateLoanAfterPayment(supabase, state.loan.id, state.loan.client_id)
    const { data: liquidatedPayments } = await supabase.from('payments').select('amount').eq('loan_id', state.loan.id).eq('status', 'paid')
    const totalReceived = liquidatedPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    await supabase.from('loans').update({ paid_amount: totalReceived }).eq('id', state.loan.id)
    setters.setPayments(prev => [payment, ...prev])
    setters.setLoan(prev => ({
      ...prev,
      status: 'paid',
      paid_amount: totalReceived,
      remaining_amount: Math.max(0, Number(loanUpdates.remaining_amount ?? prev.remaining_amount)),
      progress: 100,
    }))
    setters.setInstallments(prev => prev.map(i => i.status !== 'paid' ? { ...i, status: 'paid', paid_amount: i.amount, paid_at: state.paymentDate } : i))
    setters.setSuccessPayment(payment)
    setters.setSuccessPayments([payment])
    setters.setSuccessCoveredCount(1)
    setters.setShowLiquidation(false)
    setters.setShowSuccess(true)
    router.refresh()
    setters.setLoading(false)
  }

  const handleCapitalAbono = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state.loading) return
    if (!userId) return
    const amount = parseFloat(state.capitalAbonoAmount)
    if (isNaN(amount) || amount <= 0) return
    setters.setLoading(true)
    const { data: existingCapitalPayments } = await supabase.from('payments').select('capital_amount').eq('loan_id', state.loan.id).eq('status', 'paid')
    const existingCapitalPaid = existingCapitalPayments?.reduce((s, p) => s + Number(p.capital_amount), 0) || 0
    const { data: payment, error } = await supabase.from('payments').insert({
      loan_id: state.loan.id, client_id: state.loan.client_id, user_id: userId,
      amount, capital_amount: amount, interest_amount: 0,
      payment_date: state.paymentDate, method: state.paymentMethod,
      notes: state.paymentNotes || null, type: 'capital_abono',
    }).select().single()
    if (error) { setters.setPaymentError('Error al registrar abono: ' + error.message); setters.setLoading(false); return }
    logAuditEvent(supabase, { userId, action: 'capital_abono', entityType: 'payment', entityId: payment.id, details: { loan_id: state.loan.loan_id, client_name: state.loan.client?.name, amount } })

    const result = await rebalanceCapitalAbono({
      amount, existingCapitalPaid, loan: state.loan, installments: state.installments, paymentDate: state.paymentDate,
    })

    for (const row of result.installmentsToWrite) {
      const col = row.key === 'number' ? 'number' : 'id'
      await supabase.from('installments').update(row.data).eq('loan_id', state.loan.id).eq(col, row.value)
    }
    await supabase.from('loans').update(result.loanUpdates).eq('id', state.loan.id)

    const loanResult = await updateLoanAfterPayment(supabase, state.loan.id, state.loan.client_id)
    setters.setPayments(prev => [payment, ...prev])
    setters.setLoan(prev => ({
      ...prev,
      paid_amount: result.stateLoan.paid_amount ?? loanResult.paid_amount ?? prev.paid_amount,
      remaining_amount: result.stateLoan.remaining_amount ?? loanResult.remaining_amount ?? prev.remaining_amount,
      installment_amount: result.stateLoan.installment_amount ?? prev.installment_amount,
      total_amount: result.stateLoan.total_amount ?? prev.total_amount,
      total_interest: result.stateLoan.total_interest ?? prev.total_interest,
      progress: result.stateLoan.progress ?? loanResult.progress ?? prev.progress,
      paid_installments: result.stateLoan.paid_installments ?? loanResult.paid_installments ?? prev.paid_installments,
      status: result.stateLoan.status ?? loanResult.status ?? prev.status,
    }))
    const refreshedInsts = await supabase.from('installments').select('*').eq('loan_id', state.loan.id).order('number')
    if (refreshedInsts.data) setters.setInstallments(refreshedInsts.data)
    else if (result.fallbackInstallments) setters.setInstallments(result.fallbackInstallments)
    setters.setShowCapitalAbono(false)
    setters.setCapitalAbonoAmount('')
    setters.setSuccessPayment(payment)
    setters.setSuccessPayments([payment])
    setters.setSuccessCoveredCount(1)
    setters.setShowSuccess(true)
    router.refresh()
    setters.setLoading(false)
  }

  const handleReversePayment = async (paymentId: string) => {
    if (state.loading) return
    const payment = state.payments.find(p => p.id === paymentId)
    if (!payment || payment.status !== 'paid') return
    const reason = state.reversalReason
    if (!reason.trim()) return
    setters.setLoading(true)
    await supabase.from('payments').update({ status: 'reversed', reversal_reason: reason }).eq('id', paymentId)
    logAuditEvent(supabase, { userId, action: 'payment.reversed', entityType: 'payment', entityId: paymentId, details: { loan_id: state.loan.loan_id, client_name: state.loan.client?.name, amount: payment.amount, reason } })
    const newPaid = Math.max(0, Number(state.loan.paid_amount) - Number(payment.amount))
    const paidCapital = Number(payment.capital_amount || 0)
    const newRemaining = Math.max(0, Number(state.loan.remaining_amount) + paidCapital)
    await supabase.from('loans').update({ paid_amount: newPaid, remaining_amount: newRemaining }).eq('id', state.loan.id)

    const reversalState: Partial<Loan> = {}
    if (payment.installment_id) {
      const updated = await recalculateInstallment(supabase, payment.installment_id)
      setters.setInstallments(prev => prev.map(i => i.id === payment.installment_id ? { ...i, ...updated } : i))
    } else if (payment.type === 'liquidation') {
      for (const inst of state.installments) {
        const updated = await recalculateInstallment(supabase, inst.id)
        setters.setInstallments(prev => prev.map(i => i.id === inst.id ? { ...i, ...updated } : i))
      }
    } else if (payment.type === 'capital_abono' && newRemaining > 0) {
      const result = await rebalanceReverseAbono({
        payment, newRemaining, newPaid, loan: state.loan, installments: state.installments, payments: state.payments,
      })
      for (const row of result.installmentsToWrite) {
        const col = row.key === 'number' ? 'number' : 'id'
        await supabase.from('installments').update(row.data).eq('loan_id', state.loan.id).eq(col, row.value)
      }
      if (Object.keys(result.loanUpdates).length > 0) {
        await supabase.from('loans').update(result.loanUpdates).eq('id', state.loan.id)
      }
      if (result.installmentsPreview) setters.setInstallments(result.installmentsPreview)
      Object.assign(reversalState, result.stateLoan)
    }

    const loanUpdates = await updateLoanAfterPayment(supabase, state.loan.id, state.loan.client_id)
    if (payment.type === 'capital_abono') {
      await supabase.from('loans').update({ remaining_amount: newRemaining, paid_amount: newPaid, status: 'active' }).eq('id', state.loan.id)
      loanUpdates.remaining_amount = newRemaining
      loanUpdates.paid_amount = newPaid
      loanUpdates.status = 'active'
    } else if (loanUpdates.progress !== undefined && loanUpdates.progress < 100) {
      await supabase.from('loans').update({ status: 'active' }).eq('id', state.loan.id)
      loanUpdates.status = 'active'
    }
    setters.setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'reversed', reversal_reason: reason } : p))
    setters.setLoan(prev => ({
      ...prev,
      paid_amount: newPaid,
      remaining_amount: newRemaining,
      progress: loanUpdates.progress ?? prev.progress,
      paid_installments: loanUpdates.paid_installments ?? prev.paid_installments,
      status: loanUpdates.status ?? prev.status,
      ...reversalState,
    }))
    router.refresh()
    setters.setLoading(false)
  }

  return { handlePayInstallment, handleCapitalAbono, handleLiquidation, handleReversePayment }
}