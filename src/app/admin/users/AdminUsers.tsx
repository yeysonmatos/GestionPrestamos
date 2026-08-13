'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input, { Select } from '@/components/ui/Input'
import { formatDateShort, formatNumber } from '@/lib/utils'
import { UserPlus, UserCheck, CreditCard, HandCoins, Prohibit, MagnifyingGlass, ChartLineUp, ClockCounterClockwise, DownloadSimple } from '@phosphor-icons/react'

interface SubscriptionData {
  id: string
  plan_id: string
  plan_name: string
  plan_price: number
  billing_cycle: string
  status: string
  starts_at: string
  ends_at: string
}

interface UsageData {
  loans_count: number
  clients_count: number
  payments_count: number
  last_activity_at: string | null
}

interface UserData {
  id: string
  email: string
  role: string
  display_name: string
  status: string
  created_at: string
  usage: UsageData
  subscription: SubscriptionData | null
}

interface PlanData {
  id: string
  name: string
  price: number
  billing_cycle: string
  is_active: boolean
}

interface SubHistoryRow {
  id: string
  status: string
  plan_name: string
  plan_price: number
  billing_cycle: string
  starts_at: string
  ends_at: string
  created_at: string
}

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

export default function AdminUsers() {
  const [users, setUsers] = useState<UserData[]>([])
  const [plans, setPlans] = useState<PlanData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSub, setFilterSub] = useState('')
  const [filterPlan, setFilterPlan] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  const [showCreate, setShowCreate] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', plan_id: '', display_name: '' })
  const [creating, setCreating] = useState(false)

  const [planModal, setPlanModal] = useState<UserData | null>(null)
  const [planForm, setPlanForm] = useState({ plan_id: '', days: '30' })
  const [planSaving, setPlanSaving] = useState(false)

  const [payModal, setPayModal] = useState<UserData | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', notes: '' })
  const [paySaving, setPaySaving] = useState(false)

  const [usageModal, setUsageModal] = useState<UserData | null>(null)
  const [historyModal, setHistoryModal] = useState<UserData | null>(null)
  const [history, setHistory] = useState<SubHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, pRes] = await Promise.all([fetch('/api/admin/users'), fetch('/api/admin/plans')])
      const uData = await uRes.json()
      const pData = await pRes.json()
      if (!uRes.ok) throw new Error(uData.error || 'Error al cargar usuarios')
      if (!pRes.ok) throw new Error(pData.error || 'Error al cargar planes')
      setUsers(uData.users || [])
      setPlans(pData.plans || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => { setPage(1) }, [search, filterStatus, filterSub, filterPlan])

  function flashMessage(msg: string) {
    setMessage(msg)
    setTimeout(() => setMessage(''), 4000)
  }

  async function handleCreate() {
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear usuario')
      flashMessage('Usuario creado correctamente')
      setShowCreate(false)
      setNewUser({ email: '', password: '', plan_id: '', display_name: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setCreating(false)
  }

  async function handleToggleStatus(user: UserData) {
    setToggling(user.id)
    setError('')
    const nextStatus = user.status === 'active' ? 'blocked' : 'active'
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      flashMessage(nextStatus === 'blocked' ? 'Usuario bloqueado' : 'Usuario desbloqueado')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setToggling(null)
  }

  async function handleAssignPlan() {
    if (!planModal) return
    setPlanSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${planModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planForm.plan_id, days: planForm.days }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al asignar plan')
      flashMessage('Plan asignado y suscripción activada')
      setPlanModal(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar plan')
    }
    setPlanSaving(false)
  }

  async function handlePay() {
    if (!payModal) return
    setPaySaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: payModal.id,
          amount: Number(payForm.amount),
          method: payForm.method,
          notes: payForm.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al registrar pago')
      flashMessage(`Pago de RD$${formatNumber(Number(payForm.amount))} registrado`)
      setPayModal(null)
      setPayForm({ amount: '', method: 'cash', notes: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago')
    }
    setPaySaving(false)
  }

  async function openHistory(user: UserData) {
    setHistoryModal(user)
    setHistoryLoading(true)
    setHistory([])
    try {
      const res = await fetch(`/api/admin/users/${user.id}/subscriptions`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar historial')
      setHistory(data.history || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar historial')
    }
    setHistoryLoading(false)
  }

  const filteredUsers = users.filter(u => {
    if (u.role === 'admin') return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${u.email} ${u.display_name}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filterStatus && u.status !== filterStatus) return false
    if (filterSub) {
      const subStatus = u.subscription?.status || 'none'
      if (filterSub === 'none') {
        if (subStatus !== 'none') return false
      } else if (subStatus !== filterSub) {
        return false
      }
    }
    if (filterPlan && u.subscription?.plan_id !== filterPlan) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por email o nombre..."
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-card"
            />
          </div>
        </div>
        <Select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          options={[{ value: '', label: 'Todos los estados' }, { value: 'active', label: 'Activos' }, { value: 'blocked', label: 'Bloqueados' }]}
        />
        <Select
          value={filterSub}
          onChange={e => setFilterSub(e.target.value)}
          options={[{ value: '', label: 'Toda suscripción' }, { value: 'active', label: 'Activa' }, { value: 'trial', label: 'En prueba' }, { value: 'expired', label: 'Vencida' }, { value: 'none', label: 'Sin suscripción' }]}
        />
        <Select
          value={filterPlan}
          onChange={e => setFilterPlan(e.target.value)}
          options={[{ value: '', label: 'Todos los planes' }, ...plans.map(p => ({ value: p.id, label: p.name }))]}
        />
        <Button variant="ghost" onClick={() => { window.location.href = '/api/admin/export?type=users' }}>
          <DownloadSimple className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Nuevo usuario
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando usuarios...</div>
      ) : filteredUsers.length === 0 ? (
        <Card className="text-center py-12 text-sm text-muted-foreground">Sin usuarios que coincidan</Card>
      ) : (
        <>
        <Card className="p-0 sm:p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Registro</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map(u => {
                const sb = u.subscription ? subBadge(u.subscription.status) : null
                return (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="block hover:text-primary transition-colors">
                        <p className="font-medium text-foreground">{u.display_name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {u.subscription ? (
                        <>
                          <p className="font-medium">{u.subscription.plan_name}</p>
                          <p className="text-xs text-muted-foreground">RD${formatNumber(u.subscription.plan_price)} · {u.subscription.billing_cycle === 'yearly' ? 'anual' : 'mensual'}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Sin plan</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={u.status === 'active' ? 'success' : 'cancelled'}>{u.status === 'active' ? 'Activo' : 'Bloqueado'}</Badge>
                        {sb && <Badge variant={sb.variant}>{sb.label}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.subscription?.ends_at ? formatDateShort(u.subscription.ends_at) : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateShort(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <Button size="sm" variant="secondary" onClick={() => { setUsageModal(u) }}>
                          <ChartLineUp className="h-4 w-4 mr-1" /> Uso
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openHistory(u)}>
                          <ClockCounterClockwise className="h-4 w-4 mr-1" /> Historial
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => { setPayModal(u); setPayForm({ amount: u.subscription?.plan_price ? String(u.subscription.plan_price) : '', method: 'cash', notes: '' }) }}>
                          <HandCoins className="h-4 w-4 mr-1" /> Pago
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => { setPlanModal(u); setPlanForm({ plan_id: u.subscription?.plan_id || '', days: '30' }) }}>
                          <CreditCard className="h-4 w-4 mr-1" /> Plan
                        </Button>
                        <Button
                          size="sm"
                          variant={u.status === 'active' ? 'secondary' : 'danger'}
                          onClick={() => handleToggleStatus(u)}
                          loading={toggling === u.id}
                        >
                          {u.status === 'active'
                            ? <><Prohibit className="h-4 w-4 mr-1" /> Bloquear</>
                            : <><UserCheck className="h-4 w-4 mr-1" /> Activar</>}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Mostrando {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredUsers.length)}–{Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} de {filteredUsers.length} usuarios
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>← Anterior</Button>
            <span className="text-xs text-muted-foreground">Página {currentPage} de {totalPages}</span>
            <Button size="sm" variant="ghost" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente →</Button>
          </div>
        </div>
        </>
      )}

      {/* Create user modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo usuario">
        <div className="space-y-4">
          <Input label="Email" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required />
          <Input label="Contraseña" type="password" minLength={6} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required />
          <Input label="Nombre (opcional)" value={newUser.display_name} onChange={e => setNewUser({ ...newUser, display_name: e.target.value })} />
          <Select
            label="Plan"
            value={newUser.plan_id}
            onChange={e => setNewUser({ ...newUser, plan_id: e.target.value })}
            options={[{ value: '', label: 'Prueba (30 días)' }, ...plans.filter(p => p.is_active).map(p => ({ value: p.id, label: `${p.name} · RD$${formatNumber(p.price)}/${p.billing_cycle === 'yearly' ? 'año' : 'mes'}` }))]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} loading={creating}>
              <UserCheck className="h-4 w-4 mr-1" /> Crear
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign plan modal */}
      <Modal open={!!planModal} onClose={() => setPlanModal(null)} title={`Asignar plan a ${planModal?.email || ''}`}>
        <div className="space-y-4">
          <Select
            label="Plan"
            value={planForm.plan_id}
            onChange={e => setPlanForm({ ...planForm, plan_id: e.target.value })}
            options={plans.map(p => ({ value: p.id, label: `${p.name} · RD$${formatNumber(p.price)}/${p.billing_cycle === 'yearly' ? 'año' : 'mes'}` }))}
          />
          <Input label="Días de suscripción" type="number" min="1" value={planForm.days} onChange={e => setPlanForm({ ...planForm, days: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPlanModal(null)}>Cancelar</Button>
            <Button onClick={handleAssignPlan} loading={planSaving}>
              <CreditCard className="h-4 w-4 mr-1" /> Asignar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Register payment modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Registrar pago de ${payModal?.email || ''}`}>
        <div className="space-y-4">
          <Input label="Monto (RD$)" type="number" min="0" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} required />
          <Select
            label="Método"
            value={payForm.method}
            onChange={e => setPayForm({ ...payForm, method: e.target.value })}
            options={[{ value: 'cash', label: 'Efectivo' }, { value: 'transfer', label: 'Transferencia' }, { value: 'deposit', label: 'Depósito' }, { value: 'other', label: 'Otro' }]}
          />
          <Input label="Notas (opcional)" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPayModal(null)}>Cancelar</Button>
            <Button onClick={handlePay} loading={paySaving}>
              <HandCoins className="h-4 w-4 mr-1" /> Registrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Usage modal */}
      <Modal open={!!usageModal} onClose={() => setUsageModal(null)} title={`Uso del producto — ${usageModal?.email || ''}`}>
        {usageModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-border text-center">
                <p className="text-2xl font-bold text-foreground">{usageModal.usage?.loans_count ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Préstamos</p>
              </div>
              <div className="p-3 rounded-xl border border-border text-center">
                <p className="text-2xl font-bold text-foreground">{usageModal.usage?.clients_count ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Clientes</p>
              </div>
              <div className="p-3 rounded-xl border border-border text-center">
                <p className="text-2xl font-bold text-foreground">{usageModal.usage?.payments_count ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Pagos</p>
              </div>
            </div>
            <div className="p-3 rounded-xl border border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Última actividad</span>
              <span className="text-sm font-medium text-foreground">
                {usageModal.usage?.last_activity_at ? formatDateShort(usageModal.usage.last_activity_at) : 'Sin actividad'}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Subscription history modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={`Historial de ${historyModal?.email || ''}`}>
        <div className="space-y-3">
          {historyLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Cargando historial...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin suscripciones registradas</p>
          ) : (
            history.map(h => {
              const sb = subBadge(h.status)
              return (
                <div key={h.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">{h.plan_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateShort(h.starts_at)} → {h.ends_at ? formatDateShort(h.ends_at) : '—'}
                    </p>
                  </div>
                  <Badge variant={sb.variant}>{sb.label}</Badge>
                </div>
              )
            })
          )}
        </div>
      </Modal>
    </div>
  )
}