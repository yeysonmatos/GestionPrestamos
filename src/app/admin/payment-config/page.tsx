'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PageHeader from '@/components/ui/PageHeader'
import { BuildingOffice } from '@phosphor-icons/react'

interface Config {
  bank_name: string
  account_name: string
  account_number: string
  payment_phone: string
}

export default function AdminPaymentConfig() {
  const [form, setForm] = useState<Config>({ bank_name: '', account_name: '', account_number: '', payment_phone: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/platform-config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.config) setForm({
          bank_name: d.config.bank_name || '',
          account_name: d.config.account_name || '',
          account_number: d.config.account_number || '',
          payment_phone: d.config.payment_phone || '',
        })
      })
      .catch(() => setError('Error al cargar la configuración'))
      .finally(() => setLoading(false))
  }, [])

  function update(field: keyof Config, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/admin/platform-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al guardar')
      setMessage('Datos de pago guardados correctamente')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSaving(false)
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>

  return (
    <div className="space-y-6">
      <PageHeader title="Datos de pago" description="Cuenta bancaria donde los clientes transfieren su suscripción" />

      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BuildingOffice className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Cuenta de cobro</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Estos datos se muestran a tus clientes para que puedan pagar su suscripción por transferencia.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Banco" value={form.bank_name} onChange={e => update('bank_name', e.target.value)} placeholder="Ej: Banco Popular Dominicano" />
            <Input label="Titular de la cuenta" value={form.account_name} onChange={e => update('account_name', e.target.value)} placeholder="Ej: Juan Pérez" />
            <Input label="Número de cuenta" value={form.account_number} onChange={e => update('account_number', e.target.value)} placeholder="Ej: 123456789012" />
            <Input label="Teléfono de pago (contacto)" value={form.payment_phone} onChange={e => update('payment_phone', e.target.value)} placeholder="Ej: 809-000-0000" />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={saving}>Guardar datos de pago</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}