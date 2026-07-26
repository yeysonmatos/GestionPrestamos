import type { LoanHandlerInput } from './loan-handler.types'
import { calculateLateDays, calculateLateAmount, calculateProportionalInterest } from '@/lib/calculations'
import { updateLoanAfterPayment } from '@/lib/payments'

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
