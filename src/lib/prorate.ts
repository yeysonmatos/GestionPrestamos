// Cálculo compartido del monto a pagar en un upgrade de plan.
// Cliente y servidor usan la misma lógica para que lo que se muestra
// (estimado) coincida con lo que el backend genera.

export const CYCLE_DAYS_MONTHLY = 30
export const CYCLE_DAYS_YEARLY = 365

export function cycleDays(cycle?: string) {
  return cycle === 'yearly' ? CYCLE_DAYS_YEARLY : CYCLE_DAYS_MONTHLY
}

export interface ProrateInput {
  status: string
  currentPrice: number
  currentCycle?: string
  endsAt: string | null
  targetPrice: number
  targetCycle?: string
}

export interface ProrateResult {
  amount: number
  creditedValue: number
  prorated: boolean
  isUpgradeCredit: boolean
}

// Calcula el monto a pagar por un upgrade:
// - Trial/gratuito → monto completo del plan nuevo.
// - Plan pagado activo → se descuenta el valor prorrateado del tiempo
//   restante del ciclo actual; se paga solo la diferencia.
export function computeUpgradeAmount(inp: ProrateInput): ProrateResult {
  const targetPrice = Number(inp.targetPrice)
  const targetDays = cycleDays(inp.targetCycle)

  if (inp.status !== 'active' || Number(inp.currentPrice) <= 0) {
    return {
      amount: Math.max(0, targetPrice),
      creditedValue: 0,
      prorated: false,
      isUpgradeCredit: false,
    }
  }

  const remainingMs = inp.endsAt
    ? Math.min(
        Math.max(new Date(inp.endsAt).getTime() - Date.now(), 0),
        cycleDays(inp.currentCycle) * 24 * 60 * 60 * 1000
      )
    : 0
  const remainingFraction = remainingMs / (cycleDays(inp.currentCycle) * 24 * 60 * 60 * 1000)
  const creditedValue = Number(inp.currentPrice) * remainingFraction

  let amount = targetPrice
  if (targetDays > 0) {
    amount = Math.max(0, targetPrice - creditedValue)
  }

  return {
    amount,
    creditedValue,
    prorated: true,
    isUpgradeCredit: true,
  }
}

export function formatPlanAmount(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}