// Colores de estado centralizados (tokens) para badges, avatares, stripes y detalles.
// Un único punto de verdad para no repetir clases Tailwind sueltas en cada pantalla.

export type LoanStatusBadge = 'active' | 'paid' | 'late' | 'cancelled' | 'default'

export interface LoanStatusColors {
  avatar: string
  stripe: string
  badgeVariant: LoanStatusBadge
}

const LOAN_STATUS: Record<string, LoanStatusColors> = {
  active: { avatar: 'bg-primary', stripe: 'bg-primary', badgeVariant: 'active' },
  paid: { avatar: 'bg-success', stripe: 'bg-success', badgeVariant: 'paid' },
  late: { avatar: 'bg-destructive', stripe: 'bg-destructive', badgeVariant: 'late' },
  late_1_30: { avatar: 'bg-destructive', stripe: 'bg-destructive', badgeVariant: 'late' },
  late_31_60: { avatar: 'bg-destructive', stripe: 'bg-destructive', badgeVariant: 'late' },
  late_61_90: { avatar: 'bg-destructive', stripe: 'bg-destructive', badgeVariant: 'late' },
  cancelled: { avatar: 'bg-muted-foreground', stripe: 'bg-muted-foreground', badgeVariant: 'cancelled' },
  default: { avatar: 'bg-muted-foreground', stripe: 'bg-muted', badgeVariant: 'default' },
}

export function loanStatusColors(status?: string | null): LoanStatusColors {
  return LOAN_STATUS[status || ''] || LOAN_STATUS.default
}

export function isLateStatus(status?: string): boolean {
  return ['late', 'late_1_30', 'late_31_60', 'late_61_90'].includes(status || '')
}

// Colores para el chip de tipo de pago en historial de cobros y detalle de préstamo
export const PAYMENT_TYPE_COLORS: Record<string, string> = {
  capital_abono: 'bg-accent-light text-accent',
  liquidation: 'bg-success-light/30 text-emerald-800',
  installment: 'bg-primary-light/30 text-primary',
  default: 'bg-muted text-muted-foreground',
}

export function paymentTypeColors(type?: string | null): string {
  return PAYMENT_TYPE_COLORS[type || ''] || PAYMENT_TYPE_COLORS.default
}

// Colores del icono según método de pago
export const PAYMENT_METHOD_ICON: Record<string, string> = {
  cash: 'bg-success-light/40 text-emerald-700',
  transfer: 'bg-primary-light/30 text-primary',
  deposit: 'bg-warning-light text-amber-700',
  default: 'bg-muted text-muted-foreground',
}

export function paymentMethodColor(method?: string | null): string {
  return PAYMENT_METHOD_ICON[method || ''] || PAYMENT_METHOD_ICON.default
}