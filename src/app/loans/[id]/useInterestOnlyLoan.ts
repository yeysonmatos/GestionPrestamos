import type { LoanHandlerInput } from './loan-handler.types'
import { updateLoanAfterPayment, recalculateInstallment } from '@/lib/payments'
import { useSharedLoanHandlers } from './useSharedLoanHandlers'

export function useInterestOnlyLoan(input: LoanHandlerInput) {
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
    const newPaid = Number(state.loan.paid_amount) + amount
    const capitalRemaining = Math.max(0, Number(state.loan.amount) - existingCapitalPaid - amount)
    await supabase.from('loans').update({ paid_amount: newPaid, remaining_amount: capitalRemaining }).eq('id', state.loan.id)
    const monthlyRate = state.loan.interest_type === 'percentage' ? state.loan.interest_rate / 100 : 0
    const DAYS_IN_PERIOD: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }
    const days = DAYS_IN_PERIOD[state.loan.frequency] || 30
    const periodicRate = monthlyRate / 30 * days
    const newInterest = periodicRate * capitalRemaining
    const pendingInsts = state.installments.filter(i => i.status !== 'paid')
    const lastPendingNum = pendingInsts.length > 0 ? Math.max(...pendingInsts.map(i => i.number)) : 0
    const updatedInsts = state.installments.map(inst => {
      if (inst.status === 'paid') return inst
      const isLast = inst.number === lastPendingNum
      return {
        ...inst,
        amount: isLast ? newInterest + capitalRemaining : newInterest,
        interest: newInterest,
        capital: isLast ? capitalRemaining : 0,
        balance: isLast ? 0 : capitalRemaining,
      }
    })
    for (const inst of updatedInsts) {
      if (inst.status === 'paid') continue
      await supabase.from('installments').update({
        amount: inst.amount, interest: inst.interest,
        capital: inst.capital, balance: inst.balance,
      }).eq('id', inst.id)
    }
    await supabase.from('loans').update({ installment_amount: newInterest }).eq('id', state.loan.id)
    const loanUpdates = await updateLoanAfterPayment(supabase as any, state.loan.id, state.loan.client_id)
    const refreshedInsts = await supabase.from('installments').select('*').eq('loan_id', state.loan.id).order('number')
    if (refreshedInsts.data) setters.setInstallments(refreshedInsts.data as any)
    else setters.setInstallments(updatedInsts as any)
    setters.setPayments(prev => [payment, ...prev])
    setters.setLoan(prev => ({
      ...prev, paid_amount: newPaid, remaining_amount: capitalRemaining,
      installment_amount: newInterest,
      progress: loanUpdates.progress ?? prev.progress, paid_installments: loanUpdates.paid_installments ?? prev.paid_installments,
      status: loanUpdates.status ?? prev.status,
    }))
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
    await supabase.from('payments').update({ status: 'reversed', reversal_reason: reason }).eq('id', paymentId)
    const newPaid = Math.max(0, Number(state.loan.paid_amount) - Number(payment.amount))
    const paidCapital = Number(payment.capital_amount || 0)
    const newRemaining = Math.max(0, Number(state.loan.remaining_amount) + paidCapital)
    await supabase.from('loans').update({ paid_amount: newPaid, remaining_amount: newRemaining }).eq('id', state.loan.id)
    if (payment.installment_id) {
      const updated = await recalculateInstallment(supabase as any, payment.installment_id)
      setters.setInstallments(prev => prev.map(i => i.id === payment.installment_id ? { ...i, ...updated } as any : i))
    } else if (payment.type === 'liquidation') {
      for (const inst of state.installments) {
        const updated = await recalculateInstallment(supabase as any, inst.id)
        setters.setInstallments(prev => prev.map(i => i.id === inst.id ? { ...i, ...updated } as any : i))
      }
    } else if (payment.type === 'capital_abono' && newRemaining > 0) {
      const monthlyRate = state.loan.interest_type === 'percentage' ? state.loan.interest_rate / 100 : 0
      const DAYS_IN_PERIOD: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }
      const days = DAYS_IN_PERIOD[state.loan.frequency] || 30
      const periodicRate = monthlyRate / 30 * days
      const restoredInterest = periodicRate * newRemaining
      const pendingInsts = state.installments.filter(i => i.status !== 'paid')
      const lastPendingNum = pendingInsts.length > 0 ? Math.max(...pendingInsts.map(i => i.number)) : 0
      const restoredInsts = state.installments.map(inst => {
        if (inst.status === 'paid') return inst
        const isLast = inst.number === lastPendingNum
        return {
          ...inst, amount: isLast ? restoredInterest + newRemaining : restoredInterest,
          interest: restoredInterest,
          capital: isLast ? newRemaining : 0,
          balance: isLast ? 0 : newRemaining,
        }
      })
      for (const inst of restoredInsts) {
        if (inst.status === 'paid') continue
        await supabase.from('installments').update({
          amount: inst.amount, interest: inst.interest,
          capital: inst.capital, balance: inst.balance,
        }).eq('id', inst.id)
      }
      await supabase.from('loans').update({ installment_amount: restoredInterest }).eq('id', state.loan.id)
      setters.setInstallments(restoredInsts as any)
    }
    const loanUpdates = await updateLoanAfterPayment(supabase as any, state.loan.id, state.loan.client_id)
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
    setters.setLoan(prev => ({ ...prev, paid_amount: newPaid, remaining_amount: newRemaining, progress: loanUpdates.progress ?? prev.progress, paid_installments: loanUpdates.paid_installments ?? prev.paid_installments, status: loanUpdates.status ?? prev.status }))
    router.refresh()
    setters.setLoading(false)
  }

  return { handlePayInstallment, handleCapitalAbono, handleLiquidation, handleReversePayment }
}
