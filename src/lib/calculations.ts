import { addDays, addWeeks, addMonths, format, parseISO, differenceInCalendarDays } from 'date-fns'

interface CalculateLoanInput {
  amount: number
  interest_type: 'percentage' | 'fixed'
  interest_rate: number
  installments: number
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  start_date: string
  amortization_type?: 'interest_only' | 'french'
  open_ended?: boolean
}

interface AmortizationRow {
  number: number
  amount: number
  capital: number
  interest: number
  balance: number
  due_date: string
}

interface CalculateLoanResult {
  total_amount: number
  total_interest: number
  installment_amount: number
  installments: AmortizationRow[]
}

const DAYS_IN_PERIOD: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30,
}

export function calculateLoan(input: CalculateLoanInput): CalculateLoanResult {
  const { amount, interest_type, interest_rate, installments: n, frequency, start_date, amortization_type, open_ended } = input

  if (interest_type === 'fixed') {
    return calculateFlatRate(amount, interest_rate, n, start_date, frequency)
  }

  const monthlyRate = interest_rate / 100
  const days = DAYS_IN_PERIOD[frequency] || 30
  const periodicRate = monthlyRate / 30 * days

  if (amortization_type === 'interest_only') {
    return calculateInterestOnly(amount, periodicRate, n, start_date, frequency, open_ended)
  }

  return calculateFrenchAmortization(amount, periodicRate, n, start_date, frequency)
}

export function calculateProportionalInterest(principal: number, monthlyRate: number, daysElapsed: number): number {
  const dailyRate = monthlyRate / 30
  return round(principal * dailyRate * daysElapsed)
}

export function calculateFrenchProportionalInterest(
  remainingCapital: number,
  monthlyRate: number,
  daysElapsed: number,
): number {
  const dailyRate = monthlyRate / 30
  return round(remainingCapital * dailyRate * daysElapsed)
}

function calculateInterestOnly(
  principal: number,
  periodicRate: number,
  n: number,
  startDate: string,
  frequency: string,
  open_ended?: boolean,
): CalculateLoanResult {
  const interestPerPeriod = round(principal * periodicRate)

  if (open_ended) {
    return {
      total_amount: round(principal),
      total_interest: interestPerPeriod,
      installment_amount: interestPerPeriod,
      installments: [],
    }
  }

  const schedule: AmortizationRow[] = []
  for (let num = 1; num <= n; num++) {
    const isLast = num === n
    schedule.push({
      number: num,
      amount: isLast ? round(interestPerPeriod + principal) : interestPerPeriod,
      capital: isLast ? round(principal) : 0,
      interest: interestPerPeriod,
      balance: isLast ? 0 : round(principal),
      due_date: format(calcDueDate(startDate, frequency, num), 'yyyy-MM-dd'),
    })
  }

  return {
    total_amount: round(principal + interestPerPeriod * n),
    total_interest: round(interestPerPeriod * n),
    installment_amount: interestPerPeriod,
    installments: schedule,
  }
}

function calculateFrenchAmortization(
  principal: number,
  periodicRate: number,
  n: number,
  startDate: string,
  frequency: string,
): CalculateLoanResult {
  if (n <= 0) {
    return { total_amount: 0, total_interest: 0, installment_amount: 0, installments: [] }
  }

  let installmentAmount: number
  if (periodicRate === 0) {
    installmentAmount = principal / n
  } else {
    const factor = Math.pow(1 + periodicRate, n)
    installmentAmount = (principal * periodicRate * factor) / (factor - 1)
  }

  const schedule: AmortizationRow[] = []
  let balance = principal
  let totalInterest = 0

  for (let num = 1; num <= n; num++) {
    const interest = balance * periodicRate
    const capital = installmentAmount - interest
    balance -= capital
    if (Math.abs(balance) < 0.005) balance = 0

    totalInterest += interest

    schedule.push({
      number: num,
      amount: round(installmentAmount),
      capital: round(capital),
      interest: round(interest),
      balance: round(balance),
      due_date: format(calcDueDate(startDate, frequency, num), 'yyyy-MM-dd'),
    })
  }

  return {
    total_amount: round(principal + totalInterest),
    total_interest: round(totalInterest),
    installment_amount: round(installmentAmount),
    installments: schedule,
  }
}

function calculateFlatRate(
  amount: number,
  interestRate: number,
  n: number,
  startDate: string,
  frequency: string,
): CalculateLoanResult {
  const totalInterest = interestRate
  const totalAmount = amount + totalInterest
  const installmentAmount = totalAmount / n
  const capitalRatio = amount / totalAmount

  const schedule: AmortizationRow[] = []
  let remainingBalance = totalAmount

  for (let i = 1; i <= n; i++) {
    const capital = installmentAmount * capitalRatio
    const interest = installmentAmount - capital
    remainingBalance -= installmentAmount
    if (Math.abs(remainingBalance) < 0.005) remainingBalance = 0

    schedule.push({
      number: i,
      amount: round(installmentAmount),
      capital: round(capital),
      interest: round(interest),
      balance: round(remainingBalance),
      due_date: format(calcDueDate(startDate, frequency, i), 'yyyy-MM-dd'),
    })
  }

  return {
    total_amount: round(totalAmount),
    total_interest: round(totalInterest),
    installment_amount: round(installmentAmount),
    installments: schedule,
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function calcDueDate(startDate: string, frequency: string, installmentNumber: number): Date {
  const start = parseISO(startDate)
  const offset = installmentNumber - 1

  switch (frequency) {
    case 'daily':
      return addDays(start, offset)
    case 'weekly':
      return addWeeks(start, offset)
    case 'biweekly':
      return addDays(start, offset * 14)
    case 'monthly':
      return addMonths(start, offset)
    default:
      return addWeeks(start, offset)
  }
}

export function recalculateFrenchSchedule(
  remainingCapital: number,
  remainingInstallments: number,
  periodicRate: number,
  startDate: string,
  frequency: string,
  startFrom: number,
): CalculateLoanResult {
  if (remainingInstallments <= 0 || remainingCapital <= 0) {
    return { total_amount: 0, total_interest: 0, installment_amount: 0, installments: [] }
  }

  let installmentAmount: number
  if (periodicRate === 0) {
    installmentAmount = remainingCapital / remainingInstallments
  } else {
    const factor = Math.pow(1 + periodicRate, remainingInstallments)
    installmentAmount = (remainingCapital * periodicRate * factor) / (factor - 1)
  }

  const schedule: AmortizationRow[] = []
  let balance = remainingCapital
  let totalInterest = 0

  for (let k = 1; k <= remainingInstallments; k++) {
    const interest = balance * periodicRate
    const capital = installmentAmount - interest
    balance -= capital
    if (Math.abs(balance) < 0.005) balance = 0

    totalInterest += interest

    schedule.push({
      number: startFrom + k - 1,
      amount: round(installmentAmount),
      capital: round(capital),
      interest: round(interest),
      balance: round(balance),
      due_date: format(calcDueDate(startDate, frequency, startFrom + k - 1), 'yyyy-MM-dd'),
    })
  }

  return {
    total_amount: round(remainingCapital + totalInterest),
    total_interest: round(totalInterest),
    installment_amount: round(installmentAmount),
    installments: schedule,
  }
}

export function calculateLateDays(dueDate: string, graceDays: number = 0): number {
  const due = parseISO(dueDate)
  const now = new Date()
  return Math.max(0, differenceInCalendarDays(now, due) - graceDays)
}

export function calculateLateAmount(amount: number, lateDays: number, lateInterestRate: number): number {
  if (lateDays <= 0 || lateInterestRate <= 0) return 0
  return round(amount * (lateInterestRate / 100) * lateDays)
}
