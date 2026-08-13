'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Gear } from '@phosphor-icons/react'

interface SmtpForm {
  host: string
  port: number
  secure: boolean
  username: string
  pass: string
  from_name: string
  from_email: string
  enabled: boolean
}

const EMPTY: SmtpForm = { host: '', port: 587, secure: false, username: '', pass: '', from_name: 'Gestor de Prestamos', from_email: '', enabled: false }

export default function AdminSmtpConfig() {
  const [form, setForm] = useState<SmtpForm>(EMPTY)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/smtp-config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.config) {
          setForm({
            host: d.config.host || '',
            port: d.config.port || 587,
            secure: !!d.config.secure,
            username: d.config.username || '',
            pass: '',
            from_name: d.config.from_name || 'Gestor de Prestamos',
            from_email: d.config.from_email || '',
            enabled: !!d.config.enabled,
          })
          setConfigured(!!d.config.configured)
        }
      })
      .catch(() => setError('Error al cargar la configuración'))
      .finally(() => setLoading(false))
  }, [])

  function update(field: keyof SmtpForm, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/admin/smtp-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          host: form.host,
          port: form.port,
          secure: form.secure,
          username: form.username,
          pass: form.pass,
          from_name: form.from_name,
          from_email: form.from_email,
          enabled: form.enabled,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al guardar')
      setConfigured(true)
      setMessage('Configuración SMTP guardada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setSaving(false)
  }

  async function handleTest() {
    setTesting(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/admin/smtp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: form.from_email }),
      })
      const d = await res.json()
      if (!d.ok) {
        setError(d.error || 'El envío de prueba falló')
        return
      }
      setMessage('Correo de prueba enviado. Revisa tu bandeja.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
    setTesting(false)
  }

  if (loading) return <div className="text-center py-12 text-sm text-muted-foreground">Cargando...</div>

  return (
    <div className="space-y-4">
      {!configured && <Alert>SMTP no configurado aún. Los correos no se envían hasta completar este formulario.</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Gear className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Servidor de correo saliente</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ej. Gmail: <code>smtp.gmail.com</code> · puerto 587. Usa una contraseña de aplicación si tienes 2FA.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Servidor SMTP (host)" value={form.host} onChange={e => update('host', e.target.value)} placeholder="smtp.gmail.com" required />
            <Input label="Puerto" type="number" value={String(form.port)} onChange={e => update('port', Number(e.target.value))} required />
            <Input label="Usuario" value={form.username} onChange={e => update('username', e.target.value)} placeholder="tu-correo@dominio.com" required />
            <Input label="Contraseña" type="password" value={form.pass} onChange={e => update('pass', e.target.value)} placeholder={configured ? '•••••••• (dejar en blanco para no cambiar)' : 'Contraseña o app password'} required={!configured} />
            <Input label="Nombre del remitente" value={form.from_name} onChange={e => update('from_name', e.target.value)} />
            <Input label="Correo del remitente" type="email" value={form.from_email} onChange={e => update('from_email', e.target.value)} placeholder="no-reply@dominio.com" required />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={form.secure} onChange={e => update('secure', e.target.checked)} className="h-4 w-4 rounded border-border" />
            Conexión segura (SSL — común en puerto 465)
          </label>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={e => update('enabled', e.target.checked)} className="h-4 w-4 rounded border-border" />
            Habilitar envío de correos
          </label>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleTest} loading={testing} disabled={!configured}>
              Enviar correo de prueba
            </Button>
            <Button type="submit" loading={saving}>Guardar configuración</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}