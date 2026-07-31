import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrency(amount: number, currency: string = 'DOP'): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date, fmt: string = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: es })
}

export function formatDateShort(date: string | Date): string {
  return formatDate(date, 'dd/MM/yyyy')
}

export function formatDateFull(date: string | Date): string {
  return formatDate(date, "d 'de' MMMM 'de' yyyy")
}

export function getLocalDate(date: Date = new Date()): string {
  const d = date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function buildMonthlySeries(
  points: { month: string; income: number; loans: number }[],
  maxMonths: number = Infinity,
): { month: string; income: number; loans: number }[] {
  if (points.length === 0) return []

  const map: Record<string, { income: number; loans: number }> = {}
  let minMonth = points[0].month
  let maxMonth = points[0].month
  for (const p of points) {
    if (!map[p.month]) map[p.month] = { income: 0, loans: 0 }
    map[p.month].income += p.income
    map[p.month].loans += p.loans
    if (p.month < minMonth) minMonth = p.month
    if (p.month > maxMonth) maxMonth = p.month
  }

  const all: string[] = []
  const [sy, sm] = minMonth.split('-').map(Number)
  const [ey, em] = maxMonth.split('-').map(Number)
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    all.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }

  return all.slice(-maxMonths).map(month => ({
    month,
    income: map[month]?.income || 0,
    loans: map[month]?.loans || 0,
  }))
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getTrustLevelColor(level: string): string {
  switch (level) {
    case 'high': return 'text-green-600 bg-green-100'
    case 'medium': return 'text-yellow-600 bg-yellow-100'
    case 'low': return 'text-red-600 bg-red-100'
    default: return 'text-gray-600 bg-gray-100'
  }
}

export function getLoanStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'text-blue-600 bg-blue-100'
    case 'paid': return 'text-green-600 bg-green-100'
    case 'late': return 'text-red-600 bg-red-100'
    case 'cancelled': return 'text-gray-500 bg-gray-100'
    default: return 'text-gray-600 bg-gray-100'
  }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'Activo',
    paid: 'Pagado',
    late: 'Atrasado',
    late_1_30: 'Mora 1-30d',
    late_31_60: 'Mora 31-60d',
    late_61_90: 'Mora 61-90d',
    cancelled: 'Cancelado',
    pending: 'Pendiente',
    high: 'Alto',
    medium: 'Medio',
    low: 'Bajo',
  }
  return labels[status] || status
}
