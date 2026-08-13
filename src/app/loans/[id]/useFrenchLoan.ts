import type { Loan, Installment } from '@/types'
import { recalculateFrenchSchedule, DAYS_IN_PERIOD } from '@/lib/calculations'
import type { LoanHandlerInput, LoanRebalanceStrategies, ScheduleRowWrite } from './loan-handler.types'
import { useSharedLoanHandlers } from './useSharedLoanHandlers'

export function useFrenchLoan(input: LoanHandlerInput) {
  const rebalanceCapitalAbono: LoanRebalanceStrategies['rebalanceCapitalAbono'] = async ({
    amount, existingCapitalPaid, loan, installments, paymentDate,
  }) => {
    const installmentsToWrite: ScheduleRowWrite[] = []
    const loanUpdates: Record<string, string | number | boolean | null> = {}
    const stateLoan: Partial<Loan> = {}

    const newContractualRemaining = Math.max(0, Number(loan.remaining_amount) - amount)
    if (newContractualRemaining > 0) {
      const paidInstallmentsCount = installments.filter(i => i.status === 'paid').length
      const capitalRemaining = Math.max(0, Number(loan.amount) - existingCapitalPaid - amount)
      const remainingCount = loan.installments - paidInstallmentsCount
      if (remainingCount > 0) {
        const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
        const days = DAYS_IN_PERIOD[loan.frequency] || 30
        const periodicRate = monthlyRate / 30 * days
        const startAt = paidInstallmentsCount + 1
        const recalculated = recalculateFrenchSchedule(capitalRemaining, remainingCount, periodicRate, loan.first_payment_date, loan.frequency, startAt)
        for (const row of recalculated.installments) {
          installmentsToWrite.push({ key: 'number', value: row.number, data: { amount: row.amount, capital: row.capital, interest: row.interest, balance: row.balance } })
        }
        const oldPaidTotal = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
        const newTotalAmount = recalculated.total_amount + oldPaidTotal
        const oldPaidInterest = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.interest || 0), 0)
        const newTotalInterest = recalculated.total_interest + oldPaidInterest
        loanUpdates.installment_amount = recalculated.installment_amount
        loanUpdates.total_amount = newTotalAmount
        loanUpdates.total_interest = newTotalInterest
        stateLoan.installment_amount = recalculated.installment_amount
        stateLoan.total_amount = newTotalAmount
        stateLoan.total_interest = newTotalInterest
      }
    } else {
      loanUpdates.remaining_amount = 0
      loanUpdates.status = 'paid'
      loanUpdates.progress = 100
      loanUpdates.paid_installments = installments.length
      stateLoan.remaining_amount = 0
      stateLoan.status = 'paid'
      stateLoan.progress = 100
      stateLoan.paid_installments = installments.length
      for (const inst of installments) {
        if (inst.status !== 'paid') {
          installmentsToWrite.push({ key: 'id', value: inst.id, data: { status: 'paid', paid_at: paymentDate, paid_amount: inst.amount } })
        }
      }
    }

    return { installmentsToWrite, loanUpdates, stateLoan }
  }

  const rebalanceReverseAbono: LoanRebalanceStrategies['rebalanceReverseAbono'] = async ({
    payment, newRemaining, newPaid, loan, installments, payments,
  }) => {
    const installmentsToWrite: ScheduleRowWrite[] = []
    const loanUpdates: Record<string, string | number | boolean | null> = {}
    const stateLoan: Partial<Loan> = {}
    let installmentsPreview: Installment[] | undefined

    const paidCount = installments.filter(i => i.status === 'paid').length
    const remainingCount = loan.installments - paidCount
    const paidCapitalViaInstallments = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.capital), 0)
    const totalPaidAbonoCapital = payments.filter(p => p.type === 'capital_abono' && p.status === 'paid').reduce((s, p) => s + Number(p.capital_amount), 0)
    const reversalCapitalRemaining = Math.max(0, Number(loan.amount) - paidCapitalViaInstallments - totalPaidAbonoCapital + Number(payment.capital_amount))
    if (remainingCount > 0) {
      const monthlyRate = loan.interest_type === 'percentage' ? loan.interest_rate / 100 : 0
      const days = DAYS_IN_PERIOD[loan.frequency] || 30
      const periodicRate = monthlyRate / 30 * days
      const recalculated = recalculateFrenchSchedule(reversalCapitalRemaining, remainingCount, periodicRate, loan.first_payment_date, loan.frequency, paidCount + 1)
      for (const row of recalculated.installments) {
        installmentsToWrite.push({ key: 'number', value: row.number, data: { amount: row.amount, capital: row.capital, interest: row.interest, balance: row.balance } })
      }
      installmentsPreview = installments.map(i => {
        const r = recalculated.installments.find(r => r.number === i.number)
        return r ? { ...i, amount: r.amount, capital: r.capital, interest: r.interest, balance: r.balance } : i
      })
      const oldPaidTotal = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0)
      const newTotalAmount = recalculated.total_amount + oldPaidTotal
      const oldPaidInterest = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.interest || 0), 0)
      const newTotalInterest = recalculated.total_interest + oldPaidInterest
      loanUpdates.installment_amount = recalculated.installment_amount
      loanUpdates.total_amount = newTotalAmount
      loanUpdates.total_interest = newTotalInterest
      stateLoan.installment_amount = recalculated.installment_amount
      stateLoan.total_amount = newTotalAmount
      stateLoan.total_interest = newTotalInterest
    }

    return { installmentsToWrite, loanUpdates, stateLoan, installmentsPreview }
  }

  const strategies: LoanRebalanceStrategies = { rebalanceCapitalAbono, rebalanceReverseAbono }
  return useSharedLoanHandlers(input, strategies)
}