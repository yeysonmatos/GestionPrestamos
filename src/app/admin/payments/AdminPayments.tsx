'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { formatNumber, formatDateShort } from '@/lib/utils'
import { DownloadSimple, CheckCircle, XCircle } from '@phosphor-icons/react'

interface PaymentData {
  id: string
  user_id: string
  user_label: string
  amount: number
  payment_date: string
  method: string
  notes: string | null
  status: string
  created_at: string
  target_plan_id: string | null
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  deposit: 'Depósito',
  other: 'Otro',
}

const STATUS_LABELS: Record<string, { text: string; variant: 'paid' | 'late' | 'cancelled' | 'default' }> = {
  pending: { text: 'Pendiente', variant: 'late' },
  confirmed: { text: 'Confirmado', variant: 'paid' },
  rejected: { text: 'Rechazado', variant: 'cancelled' },
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [total, setTotal] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [counts, setCounts] = useState({ pending: 0, confirmed: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [processingId, setProcessingId] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (month) params.set('month', month)
      if (method) params.set('method', method)
      if (status) params.set('status', status)
      params.set('page', String(page))
      params.set('page_size', String(PAGE_SIZE))
      const qs = params.toString()
      const res = await fetch(`/api/admin/payments${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar pagos')
      const list = (data.payments || []) as PaymentData[]
      // Pendientes primero, luego por fecha descendente
      list.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (a.status !== 'pending' && b.status === 'pending') return 1
        return new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
      })
      setPayments(list)
      setTotal(Number(data.total) || 0)
      setTotalAmount(Number(data.total_amount) || 0)
      setCounts(data.counts || { pending: 0, confirmed: 0, rejected: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setLoading(false)
  }, [month, method, status, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  async function handleAction(paymentId: string, action: 'confirm_payment' | 'reject_payment') {
    setProcessingId(paymentId)
    setError('')
    try {
      const payment = payments.find(p => p.id === paymentId)
      if (!payment) return
      const res = await fetch(`/api/admin/users/${payment.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subscription_action: action, payment_id: paymentId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al procesar el pago')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setProcessingId('')
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Mes</label>
          <input
            type="month"
            value={month}
            onChange={e => { setMonth(e.target.value); setPage(1) }}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card min-w-0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Método</label>
          <Select
            value={method}
            onChange={e => { setMethod(e.target.value); setPage(1) }}
            options={[{ value: '', label: 'Todos' }, ...Object.entries(METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))]}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Estado</label>
          <Select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Todos' },
              { value: 'pending', label: 'Pendientes' },
              { value: 'confirmed', label: 'Confirmados' },
              { value: 'rejected', label: 'Rechazados' },
            ]}
          />
        </div>
        {month || method || status ? (
          <Button variant="ghost" onClick={() => { setMonth(''); setMethod(''); setStatus(''); setPage(1) }}>Limpiar filtros</Button>
        ) : null}
        <Button variant="ghost" onClick={() => {
          const params = new URLSearchParams()
          if (month) params.set('month', month)
          window.location.href = `/api/admin/export?type=payments${params.toString() ? `&${params.toString()}` : ''}`
        }}>
          <DownloadSimple className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total registrado</p>
            <p className="text-2xl font-bold text-foreground mt-1">RD${formatNumber(totalAmount)}</p>
          </div>
        </Card>
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pagos</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatNumber(total)}</p>
          </div>
          <div className="flex flex-col gap-1 text-right text-sm text-muted-foreground">
            <span><Badge variant="late">{counts.pending} pendientes</Badge></span>
            <span><Badge variant="paid">{counts.confirmed} confirmados</Badge></span>
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando pagos...</div>
      ) : payments.length === 0 ? (
        <Card className="text-center py-12 text-sm text-muted-foreground">Aún no hay pagos registrados</Card>
      ) : (
        <>
        <Card className="p-0 sm:p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[650px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Notas</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const st = STATUS_LABELS[p.status] || { text: p.status, variant: 'default' as const }
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{p.user_label}</td>
                    <td className="px-4 py-3 font-semibold text-success">RD${formatNumber(p.amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateShort(p.payment_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{METHOD_LABELS[p.method] || p.method}</td>
                    <td className="px-4 py-3"><Badge variant={st.variant}>{st.text}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.target_plan_id ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="active">Upgrade</Badge>
                          <span>{p.notes || 'Cambio de plan'}</span>
                        </div>
                      ) : (
                        p.notes || '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAction(p.id, 'confirm_payment')}
                            loading={processingId === p.id}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Confirmar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleAction(p.id, 'reject_payment')} disabled={processingId === p.id}>
                            <XCircle className="h-4 w-4 mr-1" /> Rechazar
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Mostrando {Math.min((currentPage - 1) * PAGE_SIZE + 1, total)}–{Math.min(currentPage * PAGE_SIZE, total)} de {total} pagos
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>← Anterior</Button>
            <span className="text-xs text-muted-foreground">Página {currentPage} de {totalPages}</span>
            <Button size="sm" variant="ghost" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente →</Button>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
