import type { LoanHandlerInput } from './loan-handler.types'
import { recalculateFrenchSchedule, DAYS_IN_PERIOD } from '@/lib/calculations'
import { updateLoanAfterPayment, recalculateInstallment } from '@/lib/payments'
import { logAuditEvent } from '@/lib/audit'
import { useSharedLoanHandlers } from './useSharedLoanHandlers'

export function useFrenchLoan(input: LoanHandlerInput) {
  const { state, setters, services } = input
  const { supabase, userId, settings, router } = services
  const { handlePayInstallment, handleLiquidation } = useSharedLoanHandlers(input)

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
    logAuditEvent(supabase, { userId, action: 'capital_abono', entityType: 'payment', entityId: payment.id, details: { loan_id: state.loan.id, amount } })
    const newContractualRemaining = Math.max(0, Number(state.loan.remaining_amount) - amount)
    const loanUpdates: Record<string, string | number | boolean | null> = {}
    if (newContractualRemaining > 0) {
      const paidInstallmentsCount = state.installments.filter(i => i.status === 'paid').length
      const capitalRemaining = Math.max(0, Number(state.loan.amount) - existingCapitalPaid - amount)
      const remainingCount = state.loan.installments - paidInstallmentsCount
      if (remainingCount > 0) {
        const monthlyRate = state.loan.interest_type === 'percentage' ? state.loan.interest_rate / 100 : 0
        const days = DAYS_IN_PERIOD[state.loan.frequency] || 30
        const periodicRate = monthlyRate / 30 * days
        const startAt = paidInstallmentsCount + 1
        const recalculated = recalculateFrenchSchedule(capitalRemaining, remainingCount, periodicRate, state.loan.first_payment_date, state.loan.frequency, startAt)
        for (const row of recalculated.installments) {
          await supabase.from('installments').update({
            amount: row.amount, capital: row.capital, interest: row.interest, balance: row.balance,
          }).eq('loan_id', state.loan.id).eq('number', row.number)
        }
        const oldPaidTotal = state.installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
        const newTotalAmount = recalculated.total_amount + oldPaidTotal
        const oldPaidInterest = state.installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.interest || 0), 0)
        const newTotalInterest = recalculated.total_interest + oldPaidInterest
        loanUpdates.installment_amount = recalculated.installment_amount
        loanUpdates.total_amount = newTotalAmount
        loanUpdates.total_interest = newTotalInterest
      }
    } else {
      loanUpdates.remaining_amount = 0
    }
    await supabase.from('loans').update(loanUpdates).eq('id', state.loan.id)
    const loanResult = await updateLoanAfterPayment(supabase, state.loan.id, state.loan.client_id)
    setters.setPayments(prev => [payment, ...prev])
    setters.setLoan(prev => ({
      ...prev,
      paid_amount: loanResult.paid_amount ?? prev.paid_amount,
      remaining_amount: newContractualRemaining <= 0 ? 0 : (loanResult.remaining_amount ?? prev.remaining_amount),
      installment_amount: (loanUpdates.installment_amount as number) ?? prev.installment_amount,
      total_amount: (loanUpdates.total_amount as number) ?? prev.total_amount,
      total_interest: (loanUpdates.total_interest as number) ?? prev.total_interest,
      progress: loanResult.progress ?? prev.progress, paid_installments: loanResult.paid_installments ?? prev.paid_installments,
      status: loanResult.status ?? prev.status,
    }))
    const refreshedInsts = await supabase.from('installments').select('*').eq('loan_id', state.loan.id).order('number')
    if (refreshedInsts.data) setters.setInstallments(refreshedInsts.data)
    setters.setShowCapitalAbono(false)
    setters.setCapitalAbonoAmount('')
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
    const reversalLoanUpdates: Record<string, number> = {}
    await supabase.from('payments').update({ status: 'reversed', reversal_reason: reason }).eq('id', paymentId)
    logAuditEvent(supabase, { userId, action: 'payment.reversed', entityType: 'payment', entityId: paymentId, details: { loan_id: state.loan.id, amount: payment.amount, reason } })
    const newPaid = Math.max(0, Number(state.loan.paid_amount) - Number(payment.amount))
    const paidCapital = Number(payment.capital_amount || 0)
    const newRemaining = Math.max(0, Number(state.loan.remaining_amount) + paidCapital)
    await supabase.from('loans').update({ paid_amount: newPaid, remaining_amount: newRemaining }).eq('id', state.loan.id)
    if (payment.installment_id) {
      const updated = await recalculateInstallment(supabase, payment.installment_id)
      setters.setInstallments(prev => prev.map(i => i.id === payment.installment_id ? { ...i, ...updated } : i))
    } else if (payment.type === 'liquidation') {
      for (const inst of state.installments) {
        const updated = await recalculateInstallment(supabase, inst.id)
        setters.setInstallments(prev => prev.map(i => i.id === inst.id ? { ...i, ...updated } : i))
      }
    } else if (payment.type === 'capital_abono' && newRemaining > 0) {
      const paidCount = state.installments.filter(i => i.status === 'paid').length
      const remainingCount = state.loan.installments - paidCount
      const paidCapitalViaInstallments = state.installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.capital), 0)
      const totalPaidAbonoCapital = state.payments.filter(p => p.type === 'capital_abono' && p.status === 'paid').reduce((s, p) => s + Number(p.capital_amount), 0)
      const reversalCapitalRemaining = Math.max(0, Number(state.loan.amount) - paidCapitalViaInstallments - totalPaidAbonoCapital + Number(payment.capital_amount))
      if (remainingCount > 0) {
        const monthlyRate = state.loan.interest_type === 'percentage' ? state.loan.interest_rate / 100 : 0
        const days = DAYS_IN_PERIOD[state.loan.frequency] || 30
        const periodicRate = monthlyRate / 30 * days
        const recalculated = recalculateFrenchSchedule(reversalCapitalRemaining, remainingCount, periodicRate, state.loan.first_payment_date, state.loan.frequency, paidCount + 1)
        for (const row of recalculated.installments) {
          await supabase.from('installments').update({ amount: row.amount, capital: row.capital, interest: row.interest, balance: row.balance }).eq('loan_id', state.loan.id).eq('number', row.number)
        }
        setters.setInstallments(prev => prev.map(i => {
          const r = recalculated.installments.find(r => r.number === i.number)
          return r ? { ...i, amount: r.amount, capital: r.capital, interest: r.interest, balance: r.balance } : i
        }))
        const oldPaidTotal = state.installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
        const newTotalAmount = recalculated.total_amount + oldPaidTotal
        const oldPaidInterest = state.installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.interest || 0), 0)
        const newTotalInterest = recalculated.total_interest + oldPaidInterest
        await supabase.from('loans').update({ installment_amount: recalculated.installment_amount, total_amount: newTotalAmount, total_interest: newTotalInterest }).eq('id', state.loan.id)
        reversalLoanUpdates.installment_amount = recalculated.installment_amount
        reversalLoanUpdates.total_amount = newTotalAmount
        reversalLoanUpdates.total_interest = newTotalInterest
      }
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
    setters.setLoan(prev => ({ ...prev, paid_amount: newPaid, remaining_amount: newRemaining, progress: loanUpdates.progress ?? prev.progress, paid_installments: loanUpdates.paid_installments ?? prev.paid_installments, status: loanUpdates.status ?? prev.status, installment_amount: reversalLoanUpdates.installment_amount ?? prev.installment_amount, total_amount: reversalLoanUpdates.total_amount ?? prev.total_amount, total_interest: reversalLoanUpdates.total_interest ?? prev.total_interest }))
    router.refresh()
    setters.setLoading(false)
  }

  return { handlePayInstallment, handleCapitalAbono, handleLiquidation, handleReversePayment }
}
