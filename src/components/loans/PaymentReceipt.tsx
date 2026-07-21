'use client'

import { formatCurrency, formatDate } from '@/lib/utils'
import type { Payment, Loan, Setting } from '@/types'

interface Props {
  payment: Payment
  loan: Loan
  settings: Setting | null
  previousBalance?: number
  typeLabel?: string
}

export default function PaymentReceipt({ payment, loan, settings, previousBalance, typeLabel }: Props) {
  const businessName = settings?.business_name || 'Gestor de Prestamos'
  const businessPhone = settings?.business_phone || ''
  const businessAddress = settings?.business_address || ''
  const receiptNumber = payment.id?.slice(0, 8).toUpperCase() || 'N/A'
  const clientName = loan.client?.name || '—'
  const clientPhone = loan.client?.phone || '—'
  const newBalance = previousBalance !== undefined
    ? Math.max(0, previousBalance - payment.amount)
    : loan.remaining_amount

  return (
    <div id="payment-receipt" className="receipt">
      <div className="receipt-content">
        <div className="receipt-header">
          <div className="receipt-brand">
            <h2 className="receipt-business-name">{businessName}</h2>
            {businessAddress && <p className="receipt-address">{businessAddress}</p>}
            {businessPhone && <p className="receipt-phone">Tel: {businessPhone}</p>}
          </div>
          <h1 className="receipt-title">RECIBO DE PAGO</h1>
          <p className="receipt-number">No. {receiptNumber}</p>
        </div>

        <div className="receipt-divider" />

        <div className="receipt-section">
          <h3 className="receipt-section-title">Datos del cliente</h3>
          <div className="receipt-row">
            <span className="receipt-label">Cliente</span>
            <span className="receipt-value">{clientName}</span>
          </div>
          <div className="receipt-row">
            <span className="receipt-label">Teléfono</span>
            <span className="receipt-value">{clientPhone}</span>
          </div>
        </div>

        <div className="receipt-section">
          <h3 className="receipt-section-title">Datos del préstamo</h3>
          <div className="receipt-row">
            <span className="receipt-label">Préstamo</span>
            <span className="receipt-value">{loan.loan_id}</span>
          </div>
          <div className="receipt-row">
            <span className="receipt-label">Tipo</span>
            <span className="receipt-value">
              {loan.amortization_type === 'interest_only' ? 'Solo interés' : 'Francesa'}
              {loan.open_ended ? ' · Abierto' : ' · Cerrado'}
            </span>
          </div>
          <div className="receipt-row">
            <span className="receipt-label">Frecuencia</span>
            <span className="receipt-value">{loan.frequency}</span>
          </div>
        </div>

        <div className="receipt-divider" />

        <div className="receipt-section">
          <h3 className="receipt-section-title">Detalle del pago</h3>
          <div className="receipt-row">
            <span className="receipt-label">Tipo</span>
            <span className="receipt-value">{typeLabel || (payment.type === 'installment' ? 'Cuota' : payment.type === 'capital_abono' ? 'Abono a capital' : payment.type === 'liquidation' ? 'Liquidación' : 'Pago')}</span>
          </div>
          <div className="receipt-row">
            <span className="receipt-label">Fecha</span>
            <span className="receipt-value">{formatDate(payment.payment_date)}</span>
          </div>
          <div className="receipt-row">
            <span className="receipt-label">Método</span>
            <span className="receipt-value">{payment.method === 'cash' ? 'Efectivo' : payment.method === 'transfer' ? 'Transferencia' : payment.method === 'deposit' ? 'Depósito' : 'Otro'}</span>
          </div>
        </div>

        <div className="receipt-divider" />

        <div className="receipt-section">
          <h3 className="receipt-section-title">Resumen</h3>
          {previousBalance !== undefined && (
            <div className="receipt-row">
              <span className="receipt-label">Balance anterior</span>
              <span className="receipt-value">{formatCurrency(previousBalance)}</span>
            </div>
          )}
          <div className="receipt-row">
            <span className="receipt-label">Monto pagado</span>
            <span className="receipt-value">{formatCurrency(payment.amount)}</span>
          </div>
          {payment.capital_amount > 0 && (
            <div className="receipt-row">
              <span className="receipt-label">Capital</span>
              <span className="receipt-value">{formatCurrency(payment.capital_amount)}</span>
            </div>
          )}
          {payment.interest_amount > 0 && (
            <div className="receipt-row">
              <span className="receipt-label">Interés</span>
              <span className="receipt-value">{formatCurrency(payment.interest_amount)}</span>
            </div>
          )}
          {payment.late_amount > 0 && (
            <div className="receipt-row">
              <span className="receipt-label">Mora</span>
              <span className="receipt-value">{formatCurrency(payment.late_amount)}</span>
            </div>
          )}
          {payment.notes && (
            <div className="receipt-row">
              <span className="receipt-label">Nota</span>
              <span className="receipt-value">{payment.notes}</span>
            </div>
          )}
          <div className="receipt-divider" />
          <div className="receipt-row receipt-total">
            <span className="receipt-label">Nuevo balance</span>
            <span className="receipt-value">{formatCurrency(newBalance)}</span>
          </div>
        </div>

        <div className="receipt-divider" />

        <div className="receipt-footer">
          <p>¡Gracias por su pago!</p>
          <p className="receipt-footer-small">
            Este recibo es un comprobante de pago válido.
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #payment-receipt, #payment-receipt * { visibility: visible; }
          #payment-receipt { position: fixed; top: 0; left: 0; width: 100%; padding: 20px; background: white; }
          @page { margin: 15mm; size: auto; }
        }
        .receipt { font-family: 'IBM Plex Sans', sans-serif; max-width: 380px; margin: 0 auto; padding: 16px; background: #fff; }
        .receipt-content { display: flex; flex-direction: column; gap: 10px; }
        .receipt-header { text-align: center; padding-bottom: 8px; }
        .receipt-brand { margin-bottom: 8px; }
        .receipt-business-name { font-size: 18px; font-weight: 700; color: #111; margin: 0; }
        .receipt-address { font-size: 11px; color: #666; margin: 2px 0 0; }
        .receipt-phone { font-size: 11px; color: #666; margin: 2px 0 0; }
        .receipt-title { font-size: 20px; font-weight: 700; color: #2563EB; margin: 8px 0 4px; letter-spacing: 1px; }
        .receipt-number { font-size: 12px; color: #888; margin: 0; font-family: monospace; }
        .receipt-divider { border: none; height: 1px; background: linear-gradient(to right, transparent, #ddd, transparent); margin: 4px 0; }
        .receipt-section { display: flex; flex-direction: column; gap: 4px; }
        .receipt-section-title { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px; }
        .receipt-row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
        .receipt-label { font-size: 13px; color: #555; }
        .receipt-value { font-size: 13px; color: #111; font-weight: 500; text-align: right; }
        .receipt-total { padding: 6px 0; }
        .receipt-total .receipt-label { font-size: 14px; font-weight: 600; color: #111; }
        .receipt-total .receipt-value { font-size: 16px; font-weight: 700; color: #2563EB; }
        .receipt-footer { text-align: center; padding-top: 4px; }
        .receipt-footer p { font-size: 12px; color: #555; margin: 2px 0; }
        .receipt-footer-small { font-size: 10px; color: #999; }
      `}</style>
    </div>
  )
}
