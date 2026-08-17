'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input, { Select } from '@/components/ui/Input'
import StatCard from '@/components/ui/StatCard'
import { formatDateShort, formatDateFull, formatNumber } from '@/lib/utils'
import { ENTITY_LABELS, actionInfo, detailsSummary } from '@/lib/audit-ui'
import { ArrowLeft, UserCircle, CreditCard, Wallet, HandCoins, ChartLineUp, ClockCounterClockwise, Scroll, CalendarPlus, ArrowsClockwise, Prohibit, UserCheck, LockKey } from '@phosphor-icons/react'

type StatusVariant = 'active' | 'paid' | 'cancelled' | 'default' | 'success'

function subBadge(status: string): { variant: StatusVariant; label: string } {
  switch (status) {
    case 'active': return { variant: 'success', label: 'Activo' }
    case 'trial': return { variant: 'active', label: 'Prueba' }
    case 'expired': return { variant: 'cancelled', label: 'Vencido' }
    case 'cancelled': return { variant: 'cancelled', label: 'Cancelado' }
    default: return { variant: 'default', label: status }
  }
}

interface UserDetail {
  user: {
    id: string
    email: string
    created_at: string | null
    last_sign_in_at: string | null
    role: string
    display_name: string
    status: string
  }
  subscription: {
    id: string
    plan_id: string
    plan_name: string
    plan_price: number
    billing_cycle: string
    status: string
    starts_at: string
    ends_at: string
  } | null
  history: {
    id: string
    status: string
    plan_name: string
    plan_price: number
    billing_cycle: string
    starts_at: string
    ends_at: string
    created_at: string
  }[]
  payments: {
    id: string
    subscription_id: string
    amount: number
    payment_date: string
    method: string
    notes: string | null
    status: string
    created_at: string
  }[]
  usage: {
    loans_count: number
    clients_count: number
    payments_count: number
    last_activity_at: string | null
  }
  audit: {
    id: string
    action: string
    entity_type: string
    entity_id: string | null
    details: Record<string, unknown>
    created_at: string
  }[]
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  deposit: 'Depósito',
  other: 'Otro',
}

export default function AdminUserDetail({ userId }: { userId: string }) {
  const [data, setData] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [plans, setPlans] = useState<{ id: string; name: string; price: number; billing_cycle: string }[]>([])
  const [extendModal, setExtendModal] = useState(false)
  const [extendDays, setExtendDays] = useState('30')
  const [extendSaving, setExtendSaving] = useState(false)
  const [planModal, setPlanModal] = useState(false)
  const [planForm, setPlanForm] = useState({ plan_id: '', days: '30', prorate: false })
  const [planSaving, setPlanSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [paymentProcessing, setPaymentProcessing] = useState('')
  const [resetModal, setResetModal] = useState(false)
  const [resetForm, setResetForm] = useState({ password: '', confirm: '' })
  const [resetSaving, setResetSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/plans', { credentials: 'include' }).then(r => r.json()).then(d => {
      if (d.plans) setPlans(d.plans)
    }).catch(() => {})
  }, [])

  function flashMessage(msg: string) {
    setMessage(msg)
    setTimeout(() => setMessage(''), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { credentials: 'include' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al cargar usuario')
      setData(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function handleExtend() {
    setExtendSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subscription_action: 'extend', days: extendDays }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al extender')
      flashMessage('Suscripción extendida correctamente')
      setExtendModal(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setExtendSaving(false)
  }

  async function handleChangePlan() {
    setPlanSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan_id: planForm.plan_id, days: planForm.days, prorate: planForm.prorate }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al cambiar plan')
      flashMessage('Plan asignado correctamente')
      setPlanModal(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setPlanSaving(false)
  }

  async function handleToggleStatus() {
    setToggling(true)
    setError('')
    const nextStatus = user && data ? (data.user.status === 'active' ? 'blocked' : 'active') : 'active'
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error')
      flashMessage(nextStatus === 'blocked' ? 'Usuario bloqueado' : 'Usuario desbloqueado')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setToggling(false)
  }

  async function handleResetPassword() {
    setResetSaving(true)
    setError('')
    if (resetForm.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      setResetSaving(false)
      return
    }
    if (resetForm.password !== resetForm.confirm) {
      setError('Las contraseñas no coinciden.')
      setResetSaving(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reset_password: resetForm.password }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al restablecer la contraseña')
      flashMessage('Contraseña restablecida correctamente')
      setResetModal(false)
      setResetForm({ password: '', confirm: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setResetSaving(false)
  }

  async function handlePaymentAction(paymentId: string, action: 'confirm_payment' | 'reject_payment') {
    setPaymentProcessing(paymentId)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subscription_action: action, payment_id: paymentId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al procesar el pago')
      flashMessage(action === 'confirm_payment' ? 'Pago confirmado y suscripción extendida' : 'Pago rechazado')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setPaymentProcessing('')
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando usuario...</div>
  if (error) return <Alert variant="danger">{error}</Alert>
  if (!data) return <div className="text-center py-12 text-sm text-muted-foreground">Sin datos</div>

  const { user, subscription, history, payments, usage, audit } = data
  const sb = subscription ? subBadge(subscription.status) : null

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="text-sm text-primary hover:underline inline-flex items-center gap-1 w-fit">
        <ArrowLeft className="h-4 w-4" /> Volver a usuarios
      </Link>

      <Card className="overflow-hidden p-0">
        <div className="bg-[#E3E9F4] px-6 py-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <UserCircle className="h-8 w-8 text-primary" weight="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{user.display_name}</h1>
                <Badge variant={user.status === 'active' ? 'success' : 'cancelled'}>{user.status === 'active' ? 'Activo' : 'Bloqueado'}</Badge>
                {user.role === 'admin' && <Badge variant="active">Admin</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span>Registro: {user.created_at ? formatDateShort(user.created_at) : '—'}</span>
                <span>Última sesión: {user.last_sign_in_at ? formatDateShort(user.last_sign_in_at) : 'Nunca'}</span>
                {usage.last_activity_at && <span>Última actividad: {formatDateShort(usage.last_activity_at)}</span>}
              </div>
            </div>
            <Button
              variant={user.status === 'active' ? 'secondary' : 'danger'}
              onClick={handleToggleStatus}
              loading={toggling}
              className="shrink-0"
            >
              {user.status === 'active'
                ? <><Prohibit className="h-4 w-4 mr-1" /> Bloquear</>
                : <><UserCheck className="h-4 w-4 mr-1" /> Activar</>}
            </Button>
            <Button variant="secondary" onClick={() => { setResetForm({ password: '', confirm: '' }); setResetModal(true) }} className="shrink-0">
              <LockKey className="h-4 w-4 mr-1" /> Restablecer contraseña
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Plan actual" value={subscription?.plan_name || 'Sin plan'} icon={CreditCard} />
        <StatCard label="Préstamos" value={usage.loans_count} icon={ChartLineUp} />
        <StatCard label="Clientes" value={usage.clients_count} icon={UserCircle} />
        <StatCard label="Pagos registrados" value={usage.payments_count} icon={HandCoins} />
      </div>

      {message && <Alert variant="success">{message}</Alert>}

      {subscription && (
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-foreground">{subscription.plan_name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                RD${formatNumber(subscription.plan_price)} · {subscription.billing_cycle === 'yearly' ? 'anual' : 'mensual'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDateShort(subscription.starts_at)} → {subscription.ends_at ? formatDateShort(subscription.ends_at) : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {sb && <Badge variant={sb.variant}>{sb.label}</Badge>}
              <Button size="sm" variant="secondary" onClick={() => { setExtendDays(subscription.status === 'trial' ? '30' : '30'); setExtendModal(true) }}>
                <CalendarPlus className="h-4 w-4 mr-1" /> Extender
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setPlanForm({ plan_id: subscription.plan_id, days: '30', prorate: false }); setPlanModal(true) }}>
                <ArrowsClockwise className="h-4 w-4 mr-1" /> Cambiar plan
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4 text-primary" /> Pagos de suscripción
          </h3>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin pagos registrados</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">RD${formatNumber(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">{METHOD_LABELS[p.method] || p.method} · {formatDateShort(p.payment_date)}</p>
                    {p.notes && <p className="text-xs text-muted-foreground truncate">{p.notes}</p>}
                  </div>
                  <Badge variant={p.status === 'pending' ? 'late' : p.status === 'confirmed' ? 'paid' : p.status === 'rejected' ? 'cancelled' : 'default'}>
                    {p.status === 'pending' ? 'Pendiente' : p.status === 'confirmed' ? 'Confirmado' : p.status === 'rejected' ? 'Rechazado' : p.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
            <HandCoins className="h-4 w-4 text-primary" /> Solicitudes de pago pendientes
          </h3>
          {payments.filter(p => p.status === 'pending').length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay solicitudes pendientes</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {payments.filter(p => p.status === 'pending').map(p => (
                <div key={p.id} className="p-3 rounded-xl border border-border">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-medium text-sm text-foreground">RD${formatNumber(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">{METHOD_LABELS[p.method] || p.method} · {formatDateShort(p.payment_date)}</p>
                      {p.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handlePaymentAction(p.id, 'confirm_payment')} loading={paymentProcessing === p.id}>
                        Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handlePaymentAction(p.id, 'reject_payment')} disabled={!!paymentProcessing}>
                        Rechazar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
</div>

      <Card>
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
            <ClockCounterClockwise className="h-4 w-4 text-primary" /> Historial de suscripciones
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin suscripciones registradas</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {history.map(h => {
                const b = subBadge(h.status)
                return (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground">{h.plan_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateShort(h.starts_at)} → {h.ends_at ? formatDateShort(h.ends_at) : '—'}</p>
                    </div>
                    <Badge variant={b.variant}>{b.label}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

      <Card className="p-0 sm:p-0 overflow-x-auto">
        <div className="px-4 pt-4 flex items-center gap-2">
          <Scroll className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Actividad reciente (auditoría)</h3>
        </div>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin actividad registrada</p>
        ) : (
          <table className="w-full text-sm min-w-[600px] mt-2">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="px-4 py-3 font-medium">Entidad</th>
                <th className="px-4 py-3 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {audit.map(l => {
                const info = actionInfo(l.action)
                return (
                  <tr key={l.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateFull(l.created_at)}</td>
                    <td className="px-4 py-3"><Badge variant={info.variant}>{info.label}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{ENTITY_LABELS[l.entity_type] || l.entity_type || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{detailsSummary(l.entity_type, l.details) || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={extendModal} onClose={() => setExtendModal(false)} title={`Extender suscripción — ${user.email}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Suma días al vencimiento actual de la suscripción.
          </p>
          <Input label="Días a extender" type="number" min="1" value={extendDays} onChange={e => setExtendDays(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setExtendModal(false)}>Cancelar</Button>
            <Button onClick={handleExtend} loading={extendSaving}>
              <CalendarPlus className="h-4 w-4 mr-1" /> Extender
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={planModal} onClose={() => setPlanModal(false)} title={`Cambiar plan — ${user.email}`}>
        <div className="space-y-4">
          <Select
            label="Plan"
            value={planForm.plan_id}
            onChange={e => setPlanForm({ ...planForm, plan_id: e.target.value })}
            options={plans.map(p => ({ value: p.id, label: `${p.name} · RD$${formatNumber(p.price)}/${p.billing_cycle === 'yearly' ? 'año' : 'mes'}` }))}
          />
          <Input label="Días de suscripción" type="number" min="1" value={planForm.days} onChange={e => setPlanForm({ ...planForm, days: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={planForm.prorate}
              onChange={e => setPlanForm({ ...planForm, prorate: e.target.checked })}
              className="h-4 w-4"
            />
            Prorratear días restantes del plan anterior
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPlanModal(false)}>Cancelar</Button>
            <Button onClick={handleChangePlan} loading={planSaving}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> Asignar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={resetModal} onClose={() => setResetModal(false)} title={`Restablecer contraseña — ${user.email}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Se reemplazará la contraseña actual del usuario. Compártela con el usuario de forma segura.
          </p>
          <Input
            label="Nueva contraseña"
            type="password"
            minLength={6}
            value={resetForm.password}
            onChange={e => setResetForm({ ...resetForm, password: e.target.value })}
          />
          <Input
            label="Confirmar contraseña"
            type="password"
            minLength={6}
            value={resetForm.confirm}
            onChange={e => setResetForm({ ...resetForm, confirm: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setResetModal(false)}>Cancelar</Button>
            <Button onClick={handleResetPassword} loading={resetSaving}>
              <LockKey className="h-4 w-4 mr-1" /> Restablecer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
