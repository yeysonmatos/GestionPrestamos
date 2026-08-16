import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  calculateLoan,
  calculateProportionalInterest,
  calculateLateDays,
  calculateLateAmount,
  nextDueDateAfter,
  recalculateFrenchSchedule,
  DAYS_IN_PERIOD,
} from '../calculations'
import { daysBetweenDateStrings, firstOfNextMonth, getLocalMonthStart } from '../utils'

afterEach(() => {
  vi.useRealTimers()
})

describe('DAYS_IN_PERIOD', () => {
  it('mapea frecuencias a días', () => {
    expect(DAYS_IN_PERIOD).toEqual({ daily: 1, weekly: 7, biweekly: 14, monthly: 30 })
  })
})

describe('calculateLoan — francesa', () => {
  it('genera cronograma con cuota fija, interés decreciente y balance final 0', () => {
    const result = calculateLoan({
      amount: 10000,
      interest_type: 'percentage',
      interest_rate: 10,
      installments: 12,
      frequency: 'monthly',
      start_date: '2026-01-01',
      amortization_type: 'french',
    })

    expect(result.installments).toHaveLength(12)
    expect(result.installment_amount).toBeCloseTo(1467.63, 2)
    expect(result.total_interest).toBeGreaterThan(7000)
    expect(result.total_amount).toBeCloseTo(10000 + result.total_interest, 2)

    const first = result.installments[0]
    const last = result.installments[result.installments.length - 1]
    expect(first.number).toBe(1)
    expect(first.capital).toBeGreaterThan(0)
    expect(first.interest).toBeCloseTo(1000, 2)
    expect(first.amount).toBeCloseTo(result.installment_amount, 2)
    expect(last.balance).toBe(0)

    const interests = result.installments.map(i => i.interest)
    for (let k = 1; k < interests.length; k++) {
      expect(interests[k]).toBeLessThan(interests[k - 1])
    }
  })

  it('fecha de vencimiento correcta por frecuencia', () => {
    const daily = calculateLoan({
      amount: 100, interest_type: 'percentage', interest_rate: 1, installments: 3,
      frequency: 'daily', start_date: '2026-02-25', amortization_type: 'french',
    })
    expect(daily.installments.map(i => i.due_date)).toEqual(['2026-02-25', '2026-02-26', '2026-02-27'])

    const monthly = calculateLoan({
      amount: 100, interest_type: 'percentage', interest_rate: 1, installments: 2,
      frequency: 'monthly', start_date: '2026-01-31', amortization_type: 'french',
    })
    expect(monthly.installments.map(i => i.due_date)).toEqual(['2026-01-31', '2026-02-28'])
  })

  it('n=0 no divide entre cero (H-5)', () => {
    const result = calculateLoan({
      amount: 100, interest_type: 'percentage', interest_rate: 5, installments: 0,
      frequency: 'monthly', start_date: '2026-01-01', amortization_type: 'french',
    })
    expect(result.installments).toHaveLength(0)
    expect(result.total_amount).toBe(0)
    expect(result.installment_amount).toBe(0)
  })

  it('tasa 0 reparte capital en partes iguales', () => {
    const result = calculateLoan({
      amount: 1000, interest_type: 'percentage', interest_rate: 0, installments: 4,
      frequency: 'monthly', start_date: '2026-01-01', amortization_type: 'french',
    })
    expect(result.installment_amount).toBe(250)
    expect(result.total_interest).toBe(0)
  })
})

describe('calculateLoan — interés-only', () => {
  it('cerrado: pagos de solo interés y capital en la última cuota', () => {
    const result = calculateLoan({
      amount: 10000,
      interest_type: 'percentage',
      interest_rate: 10,
      installments: 12,
      frequency: 'monthly',
      start_date: '2026-01-01',
      amortization_type: 'interest_only',
    })

    expect(result.installment_amount).toBe(1000)
    expect(result.installments).toHaveLength(12)
    expect(result.installments[0].capital).toBe(0)
    expect(result.installments[0].amount).toBe(1000)
    expect(result.installments[11].capital).toBe(10000)
    expect(result.installments[11].amount).toBe(11000)
    expect(result.total_amount).toBe(22000)
    expect(result.total_interest).toBe(12000)
  })

  it('abierto: sin cronograma, cuota = interés periódico', () => {
    const result = calculateLoan({
      amount: 5000,
      interest_type: 'percentage',
      interest_rate: 8,
      installments: 24,
      frequency: 'monthly',
      start_date: '2026-01-01',
      amortization_type: 'interest_only',
      open_ended: true,
    })

    expect(result.installments).toHaveLength(0)
    expect(result.installment_amount).toBe(400)
    expect(result.total_amount).toBe(5000)
    expect(result.total_interest).toBe(400)
  })
})

describe('calculateLoan — tasa fija', () => {
  it('suma interés fijo al capital y reparte', () => {
    const result = calculateLoan({
      amount: 10000,
      interest_type: 'fixed',
      interest_rate: 2000,
      installments: 4,
      frequency: 'monthly',
      start_date: '2026-01-01',
    })

    expect(result.total_amount).toBe(12000)
    expect(result.total_interest).toBe(2000)
    expect(result.installment_amount).toBe(3000)
    expect(result.installments[0].capital).toBeCloseTo(2500, 2)
    expect(result.installments[0].interest).toBeCloseTo(500, 2)
  })
})

describe('calculateProportionalInterest', () => {
  it('interés proporcional por días (liquidación anticipada)', () => {
    expect(calculateProportionalInterest(10000, 0.10, 15)).toBe(500)
    expect(calculateProportionalInterest(10000, 0.10, 0)).toBe(0)
    expect(calculateProportionalInterest(6000, 0.08, 30)).toBe(480)
  })
})

describe('calculateLateDays', () => {
  it('calcula días de mora con días de gracia (H-6)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 20, 12, 0, 0))

    expect(calculateLateDays('2026-07-10')).toBe(10)
    expect(calculateLateDays('2026-07-10', 5)).toBe(5)
    expect(calculateLateDays('2026-07-30')).toBe(0)
    expect(calculateLateDays('2026-07-10', 20)).toBe(0)
  })
})

describe('calculateLateAmount', () => {
  it('mora = monto * (tasa/100) * días', () => {
    expect(calculateLateAmount(1000, 5, 2)).toBe(100)
    expect(calculateLateAmount(1000, 0, 2)).toBe(0)
    expect(calculateLateAmount(1000, 5, 0)).toBe(0)
  })
})

describe('nextDueDateAfter (M1)', () => {
  it('retorna el próximo vencimiento estrictamente después de from', () => {
    expect(nextDueDateAfter('2026-01-05', 5, new Date(2026, 3, 20)))
      .toEqual(new Date(2026, 4, 5))
  })

  it('clampa días 29-31 a meses cortos', () => {
    expect(nextDueDateAfter('2026-01-31', 31, new Date(2026, 1, 10)))
      .toEqual(new Date(2026, 1, 28))
    expect(nextDueDateAfter('2026-01-31', 31, new Date(2026, 2, 1)))
      .toEqual(new Date(2026, 2, 31))
  })

  it('respeta bisiestos (2028)', () => {
    expect(nextDueDateAfter('2028-01-31', 31, new Date(2028, 1, 5)))
      .toEqual(new Date(2028, 1, 29))
  })
})

describe('recalculateFrenchSchedule', () => {
  it('recalcula cuotas restantes manteniendo numeración', () => {
    const result = recalculateFrenchSchedule(5000, 6, 0.05, '2026-01-05', 'monthly', 7)

    expect(result.installments).toHaveLength(6)
    expect(result.installments[0].number).toBe(7)
    expect(result.installments[5].number).toBe(12)
    expect(result.installment_amount).toBeCloseTo(985.09, 2)
    expect(result.installments[5].balance).toBe(0)
  })

  it('sin cuotas o capital retorna vacío', () => {
    expect(recalculateFrenchSchedule(5000, 0, 0.05, '2026-01-05', 'monthly', 7).installments).toHaveLength(0)
    expect(recalculateFrenchSchedule(0, 6, 0.05, '2026-01-05', 'monthly', 7).installments).toHaveLength(0)
  })
})

describe('daysBetweenDateStrings', () => {
  it('calcula días calendario entre fechas (determinístico, sin zona)', () => {
    expect(daysBetweenDateStrings('2026-07-10', '2026-07-20')).toBe(10)
    expect(daysBetweenDateStrings('2026-07-20', '2026-07-10')).toBe(-10)
    expect(daysBetweenDateStrings('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetweenDateStrings('2026-03-28', '2026-03-30')).toBe(2)
  })
})

describe('firstOfNextMonth', () => {
  it('calcula el primer día del mes siguiente (determinístico)', () => {
    expect(firstOfNextMonth('2026-07')).toBe('2026-08-01')
    expect(firstOfNextMonth('2026-12')).toBe('2027-01-01')
    expect(firstOfNextMonth('2026-01')).toBe('2026-02-01')
  })
})

describe('getLocalMonthStart', () => {
  it('devuelve el primer día del mes actual/desplazado en RD', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T15:00:00Z'))
    expect(getLocalMonthStart(0)).toBe('2026-07-01')
    expect(getLocalMonthStart(3)).toBe('2026-04-01')
    expect(getLocalMonthStart(11)).toBe('2025-08-01')
  })
})
