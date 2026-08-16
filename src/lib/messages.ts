import { formatCurrency, formatDate } from '@/lib/utils'

export function buildReceiptMessage(opts: {
  amount: number
  payType: string
  payMethod: string
  clientName: string
  loanId: string
  paymentDate: string
  remaining: number
  businessName: string
  notes?: string | null
}): string {
  const { amount, payType, payMethod, clientName, loanId, paymentDate, remaining, businessName, notes } = opts
  const noteLine = notes ? `\nNota: ${notes}` : ''
  return `🧾 RECIBO DE PAGO\n${formatCurrency(amount)}\n${payType} · ${payMethod}\n\nCliente: ${clientName}\nPréstamo: ${loanId}\nFecha: ${formatDate(paymentDate)}${noteLine}\n\nNuevo balance: ${formatCurrency(remaining)}\n\n${businessName || 'Gestor de Prestamos'}`
}

export function buildPaymentSummary(opts: {
  loanId: string
  clientName: string
  totalPaid: number
  remaining: number
  businessName: string
}): string {
  const { loanId, clientName, totalPaid, remaining, businessName } = opts
  return `📊 *RESUMEN DE PAGOS*\n\nPréstamo: ${loanId}\nCliente: ${clientName}\nTotal pagado: ${formatCurrency(totalPaid)}\nPendiente: ${formatCurrency(remaining)}\n\n${businessName || 'Gestor de Prestamos'}`
}

export function buildClientMessage(opts: {
  clientName: string
  businessName: string
  activeLoans?: number
  balance?: number
  nextDue?: string
}): string {
  const { clientName, businessName, activeLoans, balance, nextDue } = opts
  const loanLine = activeLoans !== undefined && activeLoans > 0
    ? `\nSaldo por cobrar: ${formatCurrency(balance || 0)}${nextDue ? `\nPróxima cuota: ${nextDue}` : ''}`
    : '\nActualmente no tiene préstamos pendientes.'
  return `Hola ${clientName}, saludos de ${businessName || 'Gestor de Prestamos'}.${loanLine}`
}
