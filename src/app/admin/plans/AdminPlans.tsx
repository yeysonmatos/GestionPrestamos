'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input, { Select } from '@/components/ui/Input'
import { formatNumber } from '@/lib/utils'
import { Plus, PencilSimple, Trash, Check } from '@phosphor-icons/react'

interface PlanData {
  id: string
  name: string
  price: number
  billing_cycle: string
  description: string | null
  features: string[]
  max_clients: number | null
  is_active: boolean
}

const emptyForm = { name: '', price: '', billing_cycle: 'monthly', description: '', features: '', max_clients: '' }

export default function AdminPlans() {
  const [plans, setPlans] = useState<PlanData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [modal, setModal] = useState<{ open: boolean; editing: PlanData | null }>({ open: false, editing: null })
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/plans')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar planes')
      setPlans(data.plans || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function flashMessage(msg: string) {
    setMessage(msg)
    setTimeout(() => setMessage(''), 4000)
  }

  function openCreate() {
    setForm(emptyForm)
    setModal({ open: true, editing: null })
  }

  function openEdit(plan: PlanData) {
    setForm({
      name: plan.name,
      price: String(plan.price),
      billing_cycle: plan.billing_cycle,
      description: plan.description || '',
      features: (plan.features || []).join('\n'),
      max_clients: plan.max_clients !== null && plan.max_clients !== undefined ? String(plan.max_clients) : '',
    })
    setModal({ open: true, editing: plan })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const payload = {
      name: form.name,
      price: Number(form.price) || 0,
      billing_cycle: form.billing_cycle,
      description: form.description || null,
      features: form.features.split('\n').map(f => f.trim()).filter(Boolean),
      max_clients: form.max_clients.trim() === '' ? null : Number(form.max_clients),
      is_active: true,
    }
    try {
      const url = modal.editing ? `/api/admin/plans/${modal.editing.id}` : '/api/admin/plans'
      const res = await fetch(url, {
        method: modal.editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar plan')
      flashMessage(modal.editing ? 'Plan actualizado' : 'Plan creado')
      setModal({ open: false, editing: null })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar plan')
    }
    setSaving(false)
  }

  async function handleToggleActive(plan: PlanData) {
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...plan, is_active: !plan.is_active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      flashMessage(plan.is_active ? 'Plan desactivado' : 'Plan activado')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  async function handleDelete(plan: PlanData) {
    if (!confirm(`¿Eliminar el plan "${plan.name}"?`)) return
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      flashMessage('Plan eliminado')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo plan
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Cargando planes...</div>
      ) : plans.length === 0 ? (
        <Card className="text-center py-12 text-sm text-muted-foreground">Crea tu primer plan de suscripción</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => (
            <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground">{plan.billing_cycle === 'yearly' ? 'Anual' : 'Mensual'}</p>
                </div>
                {plan.is_active
                  ? <Badge variant="success"><Check className="h-3 w-3 mr-1" /> Activo</Badge>
                  : <Badge variant="cancelled">Inactivo</Badge>}
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">RD${formatNumber(plan.price)}</p>
              <p className="text-xs text-muted-foreground mb-3">
                {plan.max_clients !== null && plan.max_clients !== undefined && plan.max_clients > 0
                  ? `Máximo ${plan.max_clients} clientes`
                  : 'Clientes ilimitados'}
              </p>
              {plan.description && <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>}
              {(plan.features || []).length > 0 && (
                <ul className="space-y-1 mb-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Check className="h-4 w-4 text-success shrink-0 mt-0.5" /> {f}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(plan)}>
                  <PencilSimple className="h-4 w-4 mr-1" /> Editar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleToggleActive(plan)}>
                  {plan.is_active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(plan)}>
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ open: false, editing: null })} title={modal.editing ? 'Editar plan' : 'Nuevo plan'}>
        <div className="space-y-4">
          <Input label="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Precio (RD$)" type="number" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
            <Select
              label="Ciclo"
              value={form.billing_cycle}
              onChange={e => setForm({ ...form, billing_cycle: e.target.value })}
              options={[{ value: 'monthly', label: 'Mensual' }, { value: 'yearly', label: 'Anual' }]}
            />
          </div>
          <Input label="Descripción" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Input
            label="Máximo de clientes (vacío = ilimitado)"
            type="number"
            min="1"
            value={form.max_clients}
            onChange={e => setForm({ ...form, max_clients: e.target.value })}
            placeholder="Ej: 30"
          />
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Features (una por línea)</label>
            <textarea
              value={form.features}
              onChange={e => setForm({ ...form, features: e.target.value })}
              rows={4}
              className="block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring bg-card"
              placeholder={'Hasta 30 clientes\nPréstamos ilimitados\nSoporte por email'}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal({ open: false, editing: null })}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>
              <Check className="h-4 w-4 mr-1" /> Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
