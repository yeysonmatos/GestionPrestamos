'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import MoneyInput from '@/components/ui/MoneyInput'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase-client'
import { logAuditEvent } from '@/lib/audit'
import { FREQUENCIES } from '@/types'
import { FloppyDisk } from '@phosphor-icons/react'
import type { Setting } from '@/types'

interface Props {
  settings: Setting | null
  showHeader?: boolean
}

export default function SettingsContent({ settings: initialSettings, showHeader = true }: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [userEmail, setUserEmail] = useState('')
  const [form, setForm] = useState({
    business_name: settings?.business_name || 'Mi Negocio',
    business_address: settings?.business_address || '',
    business_phone: settings?.business_phone || '',
    business_email: settings?.business_email || '',
    personal_name: settings?.personal_name || '',
    personal_phone: settings?.personal_phone || '',
    personal_email: settings?.personal_email || '',
    currency: 'DOP',
    late_interest_rate: String(settings?.late_interest_rate ?? 0),
    loan_id_prefix: settings?.loan_id_prefix || 'P',
    grace_days: String(settings?.grace_days || 0),
    notify_upcoming_days: String(settings?.notify_upcoming_days || 3),
    default_installments: String(settings?.default_installments || 10),
    default_frequency: settings?.default_frequency || 'weekly',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user
      if (!user) return
      if (user.email) setUserEmail(user.email)
      setForm(prev => ({
        ...prev,
        personal_email: prev.personal_email || user.email || '',
        personal_name: prev.personal_name || (user.user_metadata?.full_name as string) || '',
      }))
    })
  }, [supabase])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('Debes iniciar sesión')
      setSaving(false)
      return
    }

    const payload = {
      business_name: form.business_name,
      business_address: form.business_address,
      business_phone: form.business_phone,
      business_email: form.business_email,
      personal_name: form.personal_name,
      personal_phone: form.personal_phone,
      personal_email: form.personal_email,
      currency: form.currency,
      late_interest_rate: Math.max(0, parseFloat(form.late_interest_rate)),
      loan_id_prefix: form.loan_id_prefix,
      grace_days: Math.max(0, parseInt(form.grace_days) || 0),
      notify_upcoming_days: parseInt(form.notify_upcoming_days),
      default_installments: parseInt(form.default_installments),
      default_frequency: form.default_frequency,
    }

    const fieldKeys = Object.keys(payload) as (keyof typeof payload & string)[]
    const changes: Record<string, unknown> = {}
    const previous: Record<string, unknown> = {}
    if (settings) {
      for (const key of fieldKeys) {
        const oldVal = (settings as unknown as Record<string, unknown>)[key]
        const newVal = payload[key]
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes[key] = newVal
          previous[key] = oldVal ?? ''
        }
      }
    }

    if (settings) {
      const { error } = await supabase
        .from('settings')
        .update(payload)
        .eq('id', settings.id)
        .eq('user_id', user.id)

      if (!error) {
        setMessage('Configuración guardada correctamente')
        setSettings({ ...settings, ...payload } as Setting)
        if (Object.keys(changes).length > 0) {
          logAuditEvent(supabase, { userId: user.id, action: 'settings.updated', entityType: 'settings', entityId: settings.id, details: { ...changes, __previous: previous } })
        }
      } else {
        setMessage('Error: ' + error.message)
      }
    } else {
      const { data, error } = await supabase
        .from('settings')
        .insert({ ...payload, user_id: user.id })
        .select()
        .single()

      if (!error && data) {
        setMessage('Configuración guardada correctamente')
        setSettings(data)
        logAuditEvent(supabase, { userId: user.id, action: 'settings.updated', entityType: 'settings', entityId: data.id, details: { ...payload } })
      } else {
        setMessage('Error: ' + (error?.message || 'No se pudo guardar'))
      }
    }

    setSaving(false)
  }

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      {showHeader && (
        <PageHeader
          title="Configuración"
          description="Personaliza tu negocio y preferencias"
        />
      )}

      <Card>
        <form onSubmit={handleSave} className="space-y-6">
          {message && <Alert variant="success">{message}</Alert>}

          <div>
            <h3 className="text-base font-semibold text-foreground mb-4">Información del negocio</h3>
            <p className="text-xs text-muted-foreground -mt-2 mb-4">Esta información es la que verán tus clientes en recibos y cobros.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nombre del negocio" value={form.business_name} onChange={e => update('business_name', e.target.value)} required />
              <Input label="Teléfono" value={form.business_phone} onChange={e => update('business_phone', e.target.value)} />
              <Input label="Email" type="email" value={form.business_email} onChange={e => update('business_email', e.target.value)} />
              <Input label="Dirección" value={form.business_address} onChange={e => update('business_address', e.target.value)} />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="text-base font-semibold text-foreground mb-4">Información personal</h3>
            <p className="text-xs text-muted-foreground -mt-2 mb-4">Tus datos de contacto.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nombre" value={form.personal_name} onChange={e => update('personal_name', e.target.value)} />
              <Input label="Teléfono" value={form.personal_phone} onChange={e => update('personal_phone', e.target.value)} />
              <div>
                <Input label="Email" type="email" value={form.personal_email} onChange={e => update('personal_email', e.target.value)} />
                {userEmail && (
                  <p className="text-xs text-muted-foreground mt-1.5">Correo de tu cuenta: <span className="font-medium text-foreground">{userEmail}</span></p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="text-base font-semibold text-foreground mb-4">Préstamos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Prefijo ID préstamo" value={form.loan_id_prefix} onChange={e => update('loan_id_prefix', e.target.value)} />
              <MoneyInput label="Tasa de mora diaria (%)" value={form.late_interest_rate} onChange={e => update('late_interest_rate', e)} />
              <Input label="Días de gracia (sin mora)" type="number" min="0" value={form.grace_days} onChange={e => update('grace_days', e.target.value)} />
              <Input label="Notificar antes de (días)" type="number" value={form.notify_upcoming_days} onChange={e => update('notify_upcoming_days', e.target.value)} />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="text-base font-semibold text-foreground mb-4">Valores por defecto</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="N° cuotas" type="number" value={form.default_installments} onChange={e => update('default_installments', e.target.value)} />
              <Select label="Frecuencia" value={form.default_frequency} onChange={e => update('default_frequency', e.target.value)}
                options={FREQUENCIES.map(f => ({ value: f.value, label: f.label }))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={saving}>
              <FloppyDisk className="h-4 w-4 mr-1" /> Guardar configuración
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
