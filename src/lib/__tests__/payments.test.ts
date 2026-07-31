/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculatePaymentAllocation, processInstallmentPayment, updateLoanAfterPayment } from '../payments'
import type { Loan, Installment, Payment } from '@/types'

afterEach(() => {
  vi.useRealTimers()
})

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan_1',
    loan_id: 'PR-001',
    user_id: 'u1',
    client_id: 'client_1',
    amount: 10000,
    interest_type: 'percentage',
    interest_rate: 10,
    total_amount: 17611.56,
    total_interest: 7611.56,
    installment_amount: 1467.63,
    installments: 12,
    paid_installments: 0,
    paid_amount: 0,
    remaining_amount: 10000,
    progress: 0,
    prepaid_balance: 0,
    frequency: 'monthly',
    start_date: '2026-01-01',
    first_payment_date: '2026-01-05',
    end_date: null,
    amortization_type: 'french',
    open_ended: false,
    payment_day: null,
    status: 'active',
    late_days: 0,
    late_interest_rate: 2,
    guarantee: null,
    notes: null,
    paid_at: null,
    cancelled_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: 'inst_1',
    loan_id: 'loan_1',
    client_id: 'client_1',
    number: 1,
    amount: 500,
    capital: 100,
    interest: 400,
    balance: 400,
    paid_amount: 0,
    paid_late_amount: 0,
    due_date: '2026-07-10',
    paid_at: null,
    status: 'pending',
    late_days: 0,
    late_amount: 0,
    ...overrides,
  }
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay_1',
    loan_id: 'loan_1',
    installment_id: 'inst_1',
    client_id: 'client_1',
    user_id: 'u1',
    amount: 500,
    capital_amount: 100,
    interest_amount: 400,
    late_amount: 0,
    type: 'installment',
    payment_date: '2026-07-20',
    method: 'cash',
    notes: null,
    status: 'paid',
    reversed_by: null,
    reversed_at: null,
    reversal_reason: null,
    created_at: '2026-07-20T00:00:00Z',
    ...overrides,
  }
}

function createMockSupabase(
  db: { payments?: Payment[]; installments?: Installment[]; loans?: Loan[] } = {},
  opts: { insertError?: string; updateError?: string } = {},
) {
  const state = {
    payments: db.payments ?? [],
    installments: db.installments ?? [],
    loans: db.loans ?? [],
  }
  const calls: Array<{ table: string; op: string; payload?: unknown }> = []

  const resultFor = (table: string, op = '') => {
    if (op === 'insert' && opts.insertError) return { data: null, error: { message: opts.insertError } }
    if (op === 'update' && opts.updateError) return { data: null, error: { message: opts.updateError } }
    return { data: state[table as keyof typeof state], error: null }
  }

  const makeChain = (table: string, op = '', payload: unknown = null): any => {
    const base: any = {
      select: () => base,
      eq: () => base,
      in: () => base,
      order: () => base,
      single: async () => {
        if (op === 'insert') {
          if (opts.insertError) return { data: null, error: { message: opts.insertError } }
          return { data: { ...(payload as object) }, error: null }
        }
        const r = resultFor(table, op)
        return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }
      },
      insert: (d: unknown) => {
        calls.push({ table, op: 'insert', payload: d })
        return makeChain(table, 'insert', d)
      },
      update: (d: unknown) => {
        calls.push({ table, op: 'update', payload: d })
        return makeChain(table, 'update', d)
      },
      then: (resolve: (v: unknown) => unknown) => resolve(resultFor(table, op)),
    }
    return base
  }

  return {
    supabase: {
      from: (table: string) => makeChain(table),
      rpc: async () => ({ data: null, error: null }),
    } as unknown as SupabaseClient,
    calls,
    state,
  }
}

describe('calculatePaymentAllocation', () => {
  it('asigna primero a mora y luego a cuota (C2/A1)', () => {
    const a = calculatePaymentAllocation(600, 500, 0, 0, 100, true, 10)
    expect(a.paidToLate).toBe(100)
    expect(a.paidToInstallment).toBe(500)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.newPaidLateAmount).toBe(100)
    expect(a.expectedTotal).toBe(600)
    expect(a.isNowFullyPaid).toBe(true)
  })

  it('pago menor a la mora va toda a mora', () => {
    const a = calculatePaymentAllocation(30, 500, 0, 0, 100, true, 10)
    expect(a.paidToLate).toBe(30)
    expect(a.paidToInstallment).toBe(0)
    expect(a.totalPaidOnInstallment).toBe(0)
    expect(a.isNowFullyPaid).toBe(false)
  })

  it('sin mora todo va a la cuota', () => {
    const a = calculatePaymentAllocation(200, 500, 0, 0, 100, false)
    expect(a.paidToLate).toBe(0)
    expect(a.paidToInstallment).toBe(200)
    expect(a.totalPaidOnInstallment).toBe(200)
  })

  it('nunca sobrepasa la cuota (C1)', () => {
    const a = calculatePaymentAllocation(99999, 500, 0, 0, 100, true, 10)
    expect(a.paidToInstallment).toBe(500)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.paidToLate).toBe(100)
    expect(a.isNowFullyPaid).toBe(true)
  })

  it('respeta pagos parciales previos', () => {
    const a = calculatePaymentAllocation(200, 500, 300, 0, 0, false)
    expect(a.expectedTotal).toBe(200)
    expect(a.paidToInstallment).toBe(200)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.isNowFullyPaid).toBe(true)
  })

  it('isNowFullyPaid usa expectedTotal incluyendo mora pendiente (A2)', () => {
    const a = calculatePaymentAllocation(100, 500, 400, 30, 100, true, 10)
    expect(a.pendingLateAmount).toBe(70)
    expect(a.expectedTotal).toBe(170)
    expect(a.isNowFullyPaid).toBe(false)
  })

  it('paidToLate nunca excede mora pendiente (A1)', () => {
    const a = calculatePaymentAllocation(99999, 500, 0, 80, 100, true, 10)
    expect(a.pendingLateAmount).toBe(20)
    expect(a.paidToLate).toBe(20)
    expect(a.newPaidLateAmount).toBe(100)
  })

  it('el excedente sobre lo debido se guarda como saldo a favor', () => {
    const a = calculatePaymentAllocation(700, 500, 0, 0, 100, true, 10)
    expect(a.paidToLate).toBe(100)
    expect(a.paidToInstallment).toBe(500)
    expect(a.surplus).toBe(100)
    expect(a.creditConsumed).toBe(0)
    expect(a.newPrepaidBalance).toBe(100)
  })

  it('el saldo a favor reduce automáticamente lo que se debe pagar', () => {
    const a = calculatePaymentAllocation(200, 500, 0, 0, 0, false, 0, 300)
    expect(a.expectedTotal).toBe(200)
    expect(a.creditConsumed).toBe(300)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.isNowFullyPaid).toBe(true)
    expect(a.newPrepaidBalance).toBe(0)
  })

  it('el crédito se consume primero en cuota y luego en mora', () => {
    const a = calculatePaymentAllocation(0, 500, 0, 0, 100, true, 10, 450)
    expect(a.creditConsumed).toBe(450)
    expect(a.totalPaidOnInstallment).toBe(450)
    expect(a.expectedTotal).toBe(150)
    expect(a.isNowFullyPaid).toBe(false)
    expect(a.newPrepaidBalance).toBe(0)
  })

  it('crédito consumido y excedente se recomponen', () => {
    const a = calculatePaymentAllocation(600, 500, 0, 0, 0, false, 0, 100)
    expect(a.creditConsumed).toBe(100)
    expect(a.totalPaidOnInstallment).toBe(500)
    expect(a.surplus).toBe(200)
    expect(a.newPrepaidBalance).toBe(200)
  })
})

describe('processInstallmentPayment', () => {
  it('registra pago completo con mora y marca cuota pagada', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 20, 12, 0, 0))

    const { supabase, calls } = createMockSupabase()
    const { payment, allocation } = await processInstallmentPayment(supabase, {
      loan: makeLoan(),
      installment: makeInstallment(),
      amount: 600,
      includeMora: true,
      paymentDate: '2026-07-20',
      method: 'cash',
      notes: null,
      userId: 'u1',
      lateInterestRate: 2,
    })

    expect(allocation.totalLateAmount).toBe(100)
    expect(allocation.lateDays).toBe(10)
    expect(allocation.isNowFullyPaid).toBe(true)

    expect(payment.amount).toBe(600)
    expect(payment.late_amount).toBe(100)
    expect(payment.capital_amount).toBe(100)
    expect(payment.interest_amount).toBe(400)

    const instUpdate = calls.find(c => c.table === 'installments' && c.op === 'update')
    expect(instUpdate?.payload).toMatchObject({
      status: 'paid',
      paid_amount: 500,
      paid_late_amount: 100,
      late_amount: 100,
      late_days: 10,
      paid_at: '2026-07-20',
    })
  })

  it('pago parcial deja cuota en partial sin paid_at', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 20, 12, 0, 0))

    const { supabase, calls } = createMockSupabase()
    await processInstallmentPayment(supabase, {
      loan: makeLoan(),
      installment: makeInstallment(),
      amount: 300,
      includeMora: false,
      paymentDate: '2026-07-20',
      method: 'cash',
      notes: null,
      userId: 'u1',
      lateInterestRate: 2,
    })

    const instUpdate = calls.find(c => c.table === 'installments' && c.op === 'update')
    expect(instUpdate?.payload).toMatchObject({
      status: 'partial',
      paid_amount: 300,
      paid_late_amount: 0,
      paid_at: null,
    })
  })

  it('persiste el excedente como saldo a favor en el préstamo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 20, 12, 0, 0))

    const { supabase, calls } = createMockSupabase()
    await processInstallmentPayment(supabase, {
      loan: makeLoan(),
      installment: makeInstallment({ due_date: '2026-08-10' }),
      amount: 700,
      includeMora: false,
      paymentDate: '2026-07-20',
      method: 'cash',
      notes: null,
      userId: 'u1',
      lateInterestRate: 2,
    })

    const loanUpdate = calls.find(c => c.table === 'loans' && c.op === 'update')
    expect(loanUpdate?.payload).toMatchObject({ prepaid_balance: 200 })
  })

  it('lanza error si falla el insert del pago', async () => {
    const { supabase } = createMockSupabase({}, { insertError: 'insert failed' })

    await expect(processInstallmentPayment(supabase, {
      loan: makeLoan(),
      installment: makeInstallment(),
      amount: 600,
      includeMora: true,
      paymentDate: '2026-07-20',
      method: 'cash',
      notes: null,
      userId: 'u1',
      lateInterestRate: 2,
    })).rejects.toThrow('insert failed')
  })

  it('lanza error si falla el update de la cuota', async () => {
    const { supabase } = createMockSupabase({}, { updateError: 'update failed' })

    await expect(processInstallmentPayment(supabase, {
      loan: makeLoan(),
      installment: makeInstallment(),
      amount: 600,
      includeMora: true,
      paymentDate: '2026-07-20',
      method: 'cash',
      notes: null,
      userId: 'u1',
      lateInterestRate: 2,
    })).rejects.toThrow('Error updating installment')
  })
})

describe('updateLoanAfterPayment', () => {
  it('recalcula métricas de préstamo francés', async () => {
    const installments = [
      makeInstallment({ id: 'inst_1', status: 'paid', paid_amount: 1467.63 }),
      makeInstallment({ id: 'inst_2', number: 2, amount: 1467.63, capital: 1614.39, interest: 0, balance: 0, status: 'pending' }),
    ]
    const { supabase, calls } = createMockSupabase({
      payments: [makePayment({ id: 'pay_abono', installment_id: null, amount: 1000, capital_amount: 1000, type: 'capital_abono' })],
      installments,
      loans: [makeLoan()],
    })

    const updates = await updateLoanAfterPayment(supabase, 'loan_1', 'client_1')

    expect(updates.paid_installments).toBe(1)
    expect(updates.remaining_amount).toBe(1467.63)
    expect(updates.progress).toBe(50)
    expect(updates.status).toBeUndefined()

    const loanUpdate = calls.find(c => c.table === 'loans' && c.op === 'update')
    expect(loanUpdate?.payload).toMatchObject({
      paid_installments: 1,
      remaining_amount: 1467.63,
      progress: 50,
    })
  })

  it('marca préstamo como paid cuando todas las cuotas están pagadas', async () => {
    const installments = [
      makeInstallment({ id: 'inst_1', status: 'paid', paid_amount: 1467.63 }),
      makeInstallment({ id: 'inst_2', number: 2, status: 'paid', paid_amount: 1467.63 }),
    ]
    const loan = makeLoan({ remaining_amount: 0 })
    const { supabase } = createMockSupabase({
      installments,
      loans: [loan],
    })

    const updates = await updateLoanAfterPayment(supabase, 'loan_1', 'client_1')

    expect(updates.status).toBe('paid')
    expect(updates.progress).toBe(100)
    expect(updates.remaining_amount).toBe(0)
  })

  it('open-ended: remaining = capital - capital pagado', async () => {
    const loan = makeLoan({
      amortization_type: 'interest_only',
      open_ended: true,
      amount: 10000,
      remaining_amount: 8000,
    })
    const { supabase } = createMockSupabase({
      payments: [makePayment({ id: 'pay_1', installment_id: null, amount: 2400, capital_amount: 2000, type: 'installment' })],
      installments: [],
      loans: [loan],
    })

    const updates = await updateLoanAfterPayment(supabase, 'loan_1', 'client_1')

    expect(updates.paid_amount).toBe(2000)
    expect(updates.remaining_amount).toBe(8000)
    expect(updates.progress).toBe(20)
  })
})
