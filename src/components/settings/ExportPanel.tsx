'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase-client'
import { downloadXlsx } from '@/lib/csv'
import { formatDate, getLocalDate } from '@/lib/utils'
import { FileXls, Check, Export } from '@phosphor-icons/react'
import type { Client } from '@/types'

interface LoanRow {
  id: string
  loan_id: string
  amount: number
  remaining_amount: number
  installment_amount: number
  installments: number
  paid_installments: number
  frequency: string
  amortization_type: string
  status: string
  open_ended: boolean
  late_days: number
  start_date: string
  first_payment_date: string
  paid_amount: number
  client: Client | Client[] | null
}

interface PaymentRow {
  id: string
  amount: number
  capital_amount: number
  interest_amount: number
  late_amount: number
  type: string
  method: string
  status: string
  payment_date: string
  notes: string | null
  loan: { loan_id: string; client: Client | Client[] | null } | null
}

const STATUS_LABEL = (s: string, lateDays: number) =>
  s === 'active' ? 'En curso'
  : s === 'paid' ? 'Pagado'
  : s === 'late' || s.startsWith('late') ? `Atrasado (${lateDays} días)`
  : s === 'cancelled' ? 'Cancelado'
  : s

const FREQ_LABEL = (f?: string) =>
  f === 'daily' ? 'Diario' : f === 'weekly' ? 'Semanal' : f === 'biweekly' ? 'Quincenal' : 'Mensual'

const METHOD_LABEL = (m?: string) =>
  m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : m === 'deposit' ? 'Depósito' : 'Otro'

function toClient(c: Client | Client[] | null | undefined): Client | null {
  if (!c) return null
  return Array.isArray(c) ? c[0] || null : c
}

export default function ExportPanel() {
  const supabase = createClient()
  const [busy, setBusy] = useState<string>('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const today = getLocalDate()

  async function exportLoans() {
    setBusy('loans')
    setStatus('')
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('loans')
        .select('*, client:clients(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (err) throw new Error(err.message)
      const loans = (data || []) as LoanRow[]
      await downloadXlsx(
        ['No. préstamo', 'Cliente', 'Teléfono', 'Monto (RD$)', 'Por cobrar (RD$)', 'Tipo', 'Frecuencia', 'Cuotas pagadas', 'Total cuotas', 'Estado', 'Fecha inicio'],
        loans.map(l => {
          const client = toClient(l.client)
          return [
            l.loan_id,
            client?.name || 'Eliminado',
            client?.phone || '',
            Number(l.amount),
            Number(l.remaining_amount),
            l.amortization_type === 'interest_only' ? 'Interés' : 'Francesa',
            FREQ_LABEL(l.frequency),
            l.paid_installments || 0,
            l.installments || 0,
            STATUS_LABEL(l.status, l.late_days || 0),
            formatDate(l.start_date),
          ]
        }),
        `prestamos-${today}.xlsx`
      )
      setStatus('Préstamos exportados')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar préstamos')
    }
    setBusy('')
  }

  async function exportPayments() {
    setBusy('payments')
    setStatus('')
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('payments')
        .select('*, loan:loans(loan_id, client:clients(*))')
        .eq('status', 'paid')
        .order('payment_date', { ascending: false })
      if (err) throw new Error(err.message)
      const payments = (data || []) as PaymentRow[]
      await downloadXlsx(
        ['No. préstamo', 'Cliente', 'Monto (RD$)', 'Capital (RD$)', 'Interés (RD$)', 'Mora (RD$)', 'Tipo', 'Método', 'Estado', 'Fecha', 'Notas'],
        payments.map(p => {
          const client = toClient(p.loan?.client)
          return [
            p.loan?.loan_id || '',
            client?.name || 'Eliminado',
            Number(p.amount),
            Number(p.capital_amount || 0),
            Number(p.interest_amount || 0),
            Number(p.late_amount || 0),
            p.type === 'capital_abono' ? 'Abono' : p.type === 'liquidation' ? 'Liquidación' : p.type === 'installment' ? 'Interés' : 'Cuota',
            METHOD_LABEL(p.method),
            p.status === 'paid' ? 'Cobrado' : 'Reversado',
            formatDate(p.payment_date),
            p.notes || '',
          ]
        }),
        `cobros-historial-${today}.xlsx`
      )
      setStatus('Historial de cobros exportado')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar cobros')
    }
    setBusy('')
  }

  async function exportInstallments() {
    setBusy('installments')
    setStatus('')
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('installments')
        .select('*, loan:loans!inner(loan_id, remaining_amount, frequency, open_ended, client:clients(*))')
        .in('status', ['pending', 'partial', 'late'])
        .is('loan.deleted_at', null)
        .order('due_date')
      if (err) throw new Error(err.message)
      const rows = ((data || []) as Array<{
        number: number
        amount: number
        paid_amount: number
        due_date: string
        status: string
        late_days: number
        loan: { loan_id: string; frequency: string; client: Client | Client[] | null }
      }>).map(i => {
        const client = toClient(i.loan?.client)
        const paid = Number(i.paid_amount || 0)
        return [
          i.loan.loan_id,
          client?.name || 'Eliminado',
          client?.phone || '',
          i.number,
          Number(i.amount) - paid,
          FREQ_LABEL(i.loan?.frequency),
          formatDate(i.due_date),
          i.status === 'paid' ? 'Cobrado' : i.status === 'partial' ? 'Parcial' : i.late_days > 0 ? `Vencida (${i.late_days}d)` : 'Pendiente',
        ]
      })
      await downloadXlsx(
        ['No. préstamo', 'Cliente', 'Teléfono', 'Cuota #', 'Monto (RD$)', 'Frecuencia', 'Vence', 'Estado'],
        rows,
        `cobros-pendientes-${today}.xlsx`
      )
      setStatus('Cobros pendientes exportados')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar cobros pendientes')
    }
    setBusy('')
  }

  const items = [
    { key: 'loans', title: 'Préstamos', desc: 'Todos los préstamos activos con su saldo', label: 'Exportar préstamos', onPress: exportLoans },
    { key: 'payments', title: 'Historial de cobros', desc: 'Todos los pagos realizados', label: 'Exportar historial', onPress: exportPayments },
    { key: 'installments', title: 'Cobros pendientes', desc: 'Cuotas por cobrar (pendientes, parciales y vencidas)', label: 'Exportar cobros', onPress: exportInstallments },
  ]

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Export className="h-5 w-5 text-primary" /> Exportaciones
            </h3>
            <p className="text-sm text-muted-foreground">Descarga tus datos en Excel (.xlsx)</p>
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
        {status && (
          <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg flex items-center gap-2">
            <Check className="h-4 w-4" /> {status}
          </div>
        )}

        <div className="space-y-2">
          {items.map(item => (
            <div key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-border hover:border-primary/30 transition-all">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={item.onPress} loading={busy === item.key} className="self-start sm:self-auto">
                <FileXls className="h-4 w-4 mr-1" /> {item.label}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}