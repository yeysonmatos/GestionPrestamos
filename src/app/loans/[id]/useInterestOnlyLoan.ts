import type { LoanHandlerInput } from './loan-handler.types'
import { calculateLateDays, calculateLateAmount, calculateProportionalInterest } from '@/lib/calculations'
import { updateLoanAfterPayment, recalculateInstallment } from '@/lib/payments'

export function useInterestOnlyLoan({ state, setters, services }: LoanHandlerInput) {
  const { supabase, userId, settings, router } = services

  const handlePayInstallment = async (e: React.FormEvent) => {
    e.preventDefault()
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
      await updateLoanAfterPayment(supabase as any, state.loan.id, state.loan.client_id)
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
      const remaining = inst.amount - (inst.paid_amount || 0)
      const graceDays = settings?.grace_days || 0
      const lateRate = settings?.late_interest_rate || 0.5
      const lateDays = calculateLateDays(inst.due_date, graceDays)
      const totalLateAmount = lateDays > 0 ? calculateLateAmount(Math.max(remaining, 0.01), lateDays, lateRate) : 0
      const paidLateAmount = inst.paid_late_amount || 0
      const remainingLateAmount = Math.max(0, totalLateAmount - paidLateAmount)
      const paidToInstallment = Math.min(amount, remaining)
      const paidToLate = Math.max(0, amount - paidToInstallment)
      const newPaidInstallment = (inst.paid_amount || 0) + paidToInstallment
      const newPaidLate = paidLateAmount + paidToLate
      const payInterestAmount = Math.min(paidToInstallment, inst.interest)
      const payCapitalAmount = Math.max(0, paidToInstallment - payInterestAmount)
      const isNowFullyPaid = newPaidInstallment >= inst.amount - 0.005
      const { data: payment, error: payErr } = await supabase.from('payments').insert({
        loan_id: state.loan.id, client_id: state.loan.client_id, installment_id: inst.id,
        user_id: userId, amount, capital_amount: payCapitalAmount, interest_amount: payInterestAmount,
        late_amount: paidToLate, payment_date: state.paymentDate, method: state.paymentMethod,
        notes: state.paymentNotes || null, type: 'installment',
      }).select().single()
      if (payErr) throw payErr
      await supabase.from('installments').update({
        status: isNowFullyPaid ? 'paid' : newPaidInstallment > 0 ? 'partial' : (lateDays > 0 ? 'late' : 'pending'),
        paid_amount: newPaidInstallment, paid_late_amount: newPaidLate,
        late_amount: totalLateAmount, late_days: lateDays,
        paid_at: isNowFullyPaid ? state.paymentDate : null,
      }).eq('id', inst.id)
      const newPaidAmount = Number(state.loan.paid_amount) + amount
      const newRemaining = Math.max(0, Number(state.loan.remaining_amount) - payCapitalAmount)
      await supabase.from('loans').update({ paid_amount: newPaidAmount, remaining_amount: newRemaining }).eq('id', state.loan.id)
      const loanUpdates = await updateLoanAfterPayment(supabase as any, state.loan.id, state.loan.client_id)
      setters.setInstallments(prev => prev.map(i => i.id === inst.id
        ? { ...i, status: isNowFullyPaid ? 'paid' : newPaidInstallment > 0 ? 'partial' : (lateDays > 0 ? 'late' : 'pending'), paid_amount: newPaidInstallment, paid_late_amount: newPaidLate, late_amount: remainingLateAmount, late_days: lateDays, paid_at: isNowFullyPaid ? state.paymentDate : null }
        : i))
      setters.setPayments(prev => [payment, ...prev])
      setters.setLoan(prev => ({ ...prev, paid_amount: newPaidAmount, remaining_amount: newRemaining, progress: loanUpdates.progress ?? prev.progress, paid_installments: loanUpdates.paid_installments ?? prev.paid_installments, status: loanUpdates.status ?? prev.status }))
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

  const handleCapitalAbono = async (e: React.FormEvent) => {
    e.preventDefault()
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
    if (error) { setters.setLoading(false); return }
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

  const handleLiquidation = async () => {
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
    if (error) { setters.setLoading(false); return }
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

  const handleReversePayment = async (paymentId: string) => {
    const payment = state.payments.find(p => p.id === paymentId)
    if (!payment || payment.status !== 'paid') return
    const reason = prompt('Motivo de la reversión:')
    if (!reason) return
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
