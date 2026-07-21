import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateLateDays, calculateLateAmount } from './calculations'
import type { Loan, Installment, Payment } from '@/types'

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
}

export interface ProcessPaymentInput {
  loan: Loan
  installment: Installment
  amount: number
  includeMora: boolean
  paymentDate: string
  method: string
  notes: string | null
  userId: string
  lateInterestRate: number
  graceDays?: number
}

export interface ProcessPaymentResult {
  payment: Payment
  allocation: PaymentAllocation
  loanUpdates: {
    paid_installments: number
    paid_amount: number
    remaining_amount: number
    progress: number
    status?: string
    paid_at?: string
  }
}

export function calculatePaymentAllocation(
  amount: number,
  installmentAmount: number,
  previouslyPaid: number,
  previouslyPaidLate: number,
  totalLateAmount: number,
  includeMora: boolean,
  lateDays: number = 0,
): PaymentAllocation {
  const pendingLateAmount = Math.max(0, totalLateAmount - previouslyPaidLate)
  const remaining = installmentAmount - previouslyPaid

  let paidToInstallment: number
  let paidToLate: number

  if (includeMora) {
    paidToLate = Math.min(amount, pendingLateAmount)
    paidToInstallment = Math.min(Math.max(0, amount - paidToLate), remaining)
  } else {
    paidToLate = 0
    paidToInstallment = Math.min(amount, remaining)
  }

  const totalPaidOnInstallment = Math.min(previouslyPaid + paidToInstallment, installmentAmount)
  const newPaidLateAmount = previouslyPaidLate + paidToLate
  const expectedTotal = remaining + (includeMora ? pendingLateAmount : 0)
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
  }
}

export async function processInstallmentPayment(
  supabase: SupabaseClient,
  input: ProcessPaymentInput,
): Promise<ProcessPaymentResult> {
  const { loan, installment, amount, includeMora, paymentDate, method, notes, userId, lateInterestRate } = input

  const lateDays = calculateLateDays(installment.due_date, input.graceDays || 0)
  const previouslyPaid = installment.paid_amount || 0
  const previouslyPaidLate = installment.paid_late_amount || 0
  const remaining = installment.amount - previouslyPaid
  const totalLateAmount = calculateLateAmount(remaining > 0 ? remaining : installment.amount, lateDays, lateInterestRate)

  const allocation = calculatePaymentAllocation(
    amount,
    installment.amount,
    previouslyPaid,
    previouslyPaidLate,
    totalLateAmount,
    includeMora,
    lateDays,
  )

  const interestAmount = Math.min(allocation.paidToInstallment, installment.interest)
  const capitalAmount = Math.max(0, allocation.paidToInstallment - interestAmount)

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      loan_id: loan.id,
      installment_id: installment.id,
      client_id: loan.client_id,
      user_id: userId,
      amount,
      capital_amount: capitalAmount,
      interest_amount: interestAmount,
      late_amount: allocation.paidToLate,
      payment_date: paymentDate,
      method,
      notes: notes || null,
    })
    .select()
    .single()

  if (error || !payment) throw new Error(error?.message || 'Error creating payment')

  const newStatus = allocation.isNowFullyPaid
    ? 'paid'
    : allocation.totalPaidOnInstallment > 0
      ? 'partial'
      : 'pending'

  const { error: instError } = await supabase
    .from('installments')
    .update({
      status: newStatus,
      paid_amount: allocation.totalPaidOnInstallment,
      paid_late_amount: allocation.newPaidLateAmount,
      late_amount: totalLateAmount,
      late_days: lateDays,
      paid_at: allocation.isNowFullyPaid ? paymentDate : null,
    })
    .eq('id', installment.id)

  if (instError) throw new Error(`Error updating installment: ${instError.message}`)

  return { payment, allocation, loanUpdates: { paid_installments: 0, paid_amount: 0, remaining_amount: 0, progress: 0 } }
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

  const totalPaid = payments?.reduce((s, p) => s + Number(p.amount), 0) || 0
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
    const extraCapital = extraPayments?.reduce((s, p) => s + Number(p.capital_amount), 0) || 0

    paidAmount = installmentsPaid + extraPaid
  }

  const progress = !isOpenEnded && updatedInstallments.length > 0
    ? Math.round((fullyPaidCount / updatedInstallments.length) * 100)
    : 0

  const { data: allPayments } = await supabase
    .from('payments')
    .select('capital_amount')
    .eq('loan_id', loanId)
    .eq('status', 'paid')

  const totalCapitalPaid = allPayments?.reduce((s, p) => s + Number(p.capital_amount), 0) || 0

  const remaining = (isOpenEnded || isInterestOnly)
    ? Math.max(0, Number(loan.amount) - totalCapitalPaid)
    : Math.max(0, Number(loan.total_amount || loan.amount) - paidAmount)

  const updates: Record<string, string | number | boolean> = {
    paid_installments: fullyPaidCount,
    paid_amount: paidAmount,
    remaining_amount: remaining,
    progress,
  }

  const allPaid = !isOpenEnded && updatedInstallments.length > 0 && fullyPaidCount >= updatedInstallments.length
  if (allPaid) {
    updates.status = 'paid'
    updates.paid_at = new Date().toISOString()
  }

  await supabase.from('loans').update(updates).eq('id', loanId)
  await supabase.rpc('update_client_stats', { p_client_id: clientId })

  return updates as Partial<Loan>
}
