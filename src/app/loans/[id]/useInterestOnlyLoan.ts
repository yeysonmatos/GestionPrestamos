import type { Loan, Installment } from '@/types'
import { DAYS_IN_PERIOD } from '@/lib/calculations'
import type { LoanHandlerInput, LoanRebalanceStrategies, ScheduleRowWrite } from './loan-handler.types'
import { useSharedLoanHandlers } from './useSharedLoanHandlers'

export function useInterestOnlyLoan(input: LoanHandlerInput) {
  const rebalanceCapitalAbono: LoanRebalanceStrategies['rebalanceCapitalAbono'] = async ({
    amount, existingCapitalPaid, loan, installments, paymentDate,
  }) => {
    const installmentsToWrite: ScheduleRowWrite[] = []
    const loanUpdates: Record<string, string | number | boolean | null> = {}
    const stateLoan: Partial<Loan> = {}
    let fallbackInstallments: Installment[] | undefined

    const newPaid = Number(loan.paid_amount) + amount
    const capitalRemaining = Math.max(0, Number(loan.amount) - existingCapitalPaid - amount)
    loanUpdates.paid_amount = newPaid
    loanUpdates.remaining_amount = capitalRemaining
    stateLoan.paid_amount = newPaid
    stateLoan.remaining_amount = capitalRemaining

    if (capitalRemaining <= 0) {
      loanUpdates.status = 'paid'
      loanUpdates.progress = 100
      loanUpdates.paid_installments = installments.length
      stateLoan.status = 'paid'
      stateLoan.progress = 100
      stateLoan.paid_installments = installments.length
      for (const inst of installments) {
        if (inst.status !== 'paid') {
          installmentsToWrite.push({ key: 'id', value: inst.id, data: { status: 'paid', paid_at: paymentDate, paid_amount: inst.amount } })
        }
      }
      fallbackInstallments = installments.map(i => i.status !== 'paid' ? { ...i, status: 'paid', paid_at: paymentDate, paid_amount: i.amount } : i)
      return { installmentsToWrite, loanUpdates, stateLoan, fallbackInstallments }
    }

    const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
    const days = DAYS_IN_PERIOD[loan.frequency] || 30
    const periodicRate = monthlyRate / 30 * days
    const newInterest = periodicRate * capitalRemaining
    const pendingInsts = installments.filter(i => i.status !== 'paid')
    const lastPendingNum = pendingInsts.length > 0 ? Math.max(...pendingInsts.map(i => i.number)) : 0
    const updatedInsts = installments.map(inst => {
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
      installmentsToWrite.push({ key: 'id', value: inst.id, data: { amount: inst.amount, interest: inst.interest, capital: inst.capital, balance: inst.balance } })
    }
    loanUpdates.installment_amount = newInterest
    stateLoan.installment_amount = newInterest
    fallbackInstallments = updatedInsts

    return { installmentsToWrite, loanUpdates, stateLoan, fallbackInstallments }
  }

  const rebalanceReverseAbono: LoanRebalanceStrategies['rebalanceReverseAbono'] = async ({
    newRemaining, loan, installments,
  }) => {
    const installmentsToWrite: ScheduleRowWrite[] = []
    const loanUpdates: Record<string, string | number | boolean | null> = {}
    const stateLoan: Partial<Loan> = {}
    let installmentsPreview: Installment[] | undefined

    const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
    const days = DAYS_IN_PERIOD[loan.frequency] || 30
    const periodicRate = monthlyRate / 30 * days
    const restoredInterest = periodicRate * newRemaining
    const pendingInsts = installments.filter(i => i.status !== 'paid')
    const lastPendingNum = pendingInsts.length > 0 ? Math.max(...pendingInsts.map(i => i.number)) : 0
    const restoredInsts = installments.map(inst => {
      if (inst.status === 'paid') return inst
      const isLast = inst.number === lastPendingNum
      return {
        ...inst,
        amount: isLast ? restoredInterest + newRemaining : restoredInterest,
        interest: restoredInterest,
        capital: isLast ? newRemaining : 0,
        balance: isLast ? 0 : newRemaining,
      }
    })
    for (const inst of restoredInsts) {
      if (inst.status === 'paid') continue
      installmentsToWrite.push({ key: 'id', value: inst.id, data: { amount: inst.amount, interest: inst.interest, capital: inst.capital, balance: inst.balance } })
    }
    loanUpdates.installment_amount = restoredInterest
    stateLoan.installment_amount = restoredInterest
    installmentsPreview = restoredInsts

    return { installmentsToWrite, loanUpdates, stateLoan, installmentsPreview }
  }

  const strategies: LoanRebalanceStrategies = { rebalanceCapitalAbono, rebalanceReverseAbono }
  return useSharedLoanHandlers(input, strategies)
}