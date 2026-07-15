import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrency(amount: number, currency: string = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
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
    cancelled: 'Cancelado',
    pending: 'Pendiente',
    high: 'Alto',
    medium: 'Medio',
    low: 'Bajo',
  }
  return labels[status] || status
}
