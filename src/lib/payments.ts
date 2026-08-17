import type { SupabaseClient } from '@supabase/supabase-js'
import type { Loan, Installment } from '@/types'

export interface PaymentAllocation {
  paidToInstallment: number
  paidToLate: number
  totalPaidOnInstallment: number
  newPaidLateAmount: number
  isNowFullyPaid: boolean
  lateDays: number
  totalLateAmount: number
  pendingLateAmount: number
  expectedTotal: number
  surplus: number
  creditConsumed: number
  newPrepaidBalance: number
}

export function calculatePaymentAllocation(
  amount: number,
  installmentAmount: number,
  previouslyPaid: number,
  previouslyPaidLate: number,
  totalLateAmount: number,
  includeMora: boolean,
  lateDays: number = 0,
  availableCredit: number = 0,
): PaymentAllocation {
  const pendingLateAmount = Math.max(0, totalLateAmount - previouslyPaidLate)
  const remaining = installmentAmount - previouslyPaid

  const creditForInstallment = Math.min(availableCredit, Math.max(0, remaining))
  const creditForLate = Math.min(Math.max(0, availableCredit - creditForInstallment), pendingLateAmount)
  const creditConsumed = creditForInstallment + creditForLate
  const effectiveRemaining = Math.max(0, remaining - creditForInstallment)
  const effectivePendingLate = Math.max(0, pendingLateAmount - creditForLate)

  let paidToInstallment: number
  let paidToLate: number

  if (includeMora) {
    paidToLate = Math.min(amount, effectivePendingLate)
    paidToInstallment = Math.min(Math.max(0, amount - paidToLate), effectiveRemaining)
  } else {
    paidToLate = 0
    paidToInstallment = Math.min(amount, effectiveRemaining)
  }

  const totalPaidOnInstallment = Math.min(previouslyPaid + creditForInstallment + paidToInstallment, installmentAmount)
  const newPaidLateAmount = previouslyPaidLate + creditForLate + paidToLate
  const surplus = Math.max(0, amount - paidToInstallment - paidToLate)
  const newPrepaidBalance = Math.max(0, availableCredit - creditConsumed + surplus)
  const expectedTotal = effectiveRemaining + (includeMora ? effectivePendingLate : 0)
  const isNowFullyPaid = amount >= expectedTotal

  return {
    paidToInstallment,
    paidToLate,
    totalPaidOnInstallment,
    newPaidLateAmount,
    isNowFullyPaid,
    lateDays,
    totalLateAmount,
    pendingLateAmount,
    expectedTotal,
    surplus,
    creditConsumed,
    newPrepaidBalance,
  }
}

export async function recalculateInstallment(
  supabase: SupabaseClient,
  installmentId: string,
): Promise<Partial<Installment>> {
  const { data: payments } = await supabase
    .from('payments')
    .select('amount, capital_amount, interest_amount, late_amount, payment_date')
    .eq('installment_id', installmentId)
    .eq('status', 'paid')
    .order('payment_date', { ascending: false })

  const totalPaid = payments?.reduce((s, p) => s + Number(p.capital_amount || 0) + Number(p.interest_amount || 0), 0) || 0
  const totalLatePaid = payments?.reduce((s, p) => s + Number(p.late_amount), 0) || 0

  const { data: inst } = await supabase
    .from('installments')
    .select('amount')
    .eq('id', installmentId)
    .single()

  if (!inst) return {}

  const amount = Number(inst.amount)
  const isFullyPaid = totalPaid >= amount
  const latestPaymentDate = payments?.[0]?.payment_date || null

  const newStatus = isFullyPaid ? 'paid' : (totalPaid > 0 ? 'partial' : 'pending')

  const updates: Record<string, string | number | boolean | null> = {
    status: newStatus,
    paid_amount: Math.min(totalPaid, amount),
    paid_late_amount: totalLatePaid,
    paid_at: isFullyPaid ? latestPaymentDate : null,
  }

  const { error } = await supabase.from('installments').update(updates).eq('id', installmentId)
  if (error) throw new Error(`Error recalculating installment: ${error.message}`)

  return updates as Partial<Installment>
}

export async function updateLoanAfterPayment(
  supabase: SupabaseClient,
  loanId: string,
  clientId: string,
): Promise<Partial<Loan>> {
  const { data: updatedInstallments } = await supabase
    .from('installments')
    .select('*')
    .eq('loan_id', loanId)

  if (!updatedInstallments) return {}

  const { data: loan } = await supabase
    .from('loans')
    .select('*')
    .eq('id', loanId)
    .single()

  if (!loan) return {}

  const isInterestOnly = loan.amortization_type === 'interest_only'
  const isOpenEnded = loan.open_ended

  let fullyPaidCount = 0
  let paidAmount = 0

  if (isOpenEnded) {
    const { data: payments } = await supabase
      .from('payments')
      .select('capital_amount, amount')
      .eq('loan_id', loanId)
      .eq('status', 'paid')

    paidAmount = payments?.reduce((s, p) => s + Number(p.capital_amount), 0) || 0
    fullyPaidCount = 0
  } else {
    fullyPaidCount = updatedInstallments.filter(i => i.status === 'paid').length
    const installmentsPaid = updatedInstallments.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
    const { data: extraPayments } = await supabase
      .from('payments')
      .select('amount, capital_amount')
      .eq('loan_id', loanId)
      .eq('status', 'paid')
      .in('type', ['capital_abono', 'liquidation'])
    const extraPaid = extraPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0

    paidAmount = installmentsPaid + extraPaid
  }

  const { data: allPayments } = await supabase
    .from('payments')
    .select('capital_amount')
    .eq('loan_id', loanId)
    .eq('status', 'paid')

  const totalCapitalPaid = allPayments?.reduce((s, p) => s + Number(p.capital_amount), 0) || 0

  const remaining = (isOpenEnded || isInterestOnly)
    ? Math.max(0, Number(loan.amount) - totalCapitalPaid)
    : updatedInstallments
      .filter(i => i.status !== 'paid')
      .reduce((s, i) => s + Number(i.amount) - Number(i.paid_amount || 0), 0)

  const progress = isInterestOnly
    ? Math.round(((Number(loan.amount) - remaining) / Number(loan.amount)) * 100)
    : !isOpenEnded && updatedInstallments.length > 0
      ? Math.round((fullyPaidCount / updatedInstallments.length) * 100)
      : 0

  const updates: Record<string, string | number | boolean> = {
    paid_installments: fullyPaidCount,
    paid_amount: paidAmount,
    remaining_amount: remaining,
    progress,
  }

  const allPaid = !isOpenEnded && updatedInstallments.length > 0 && fullyPaidCount >= updatedInstallments.length && remaining <= 0
  if (allPaid) {
    updates.status = 'paid'
    updates.paid_at = new Date().toISOString()
  }

  await supabase.from('loans').update(updates).eq('id', loanId)
  await supabase.rpc('update_client_stats', { p_client_id: clientId })

  return updates as Partial<Loan>
}
