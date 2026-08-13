'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Input, { Select } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase-client'
import { COUNTRIES, TIMEZONES } from '@/types'

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    business_name: '',
    business_phone: '',
    country: 'República Dominicana',
    currency: 'DOP',
    timezone: 'GMT-4',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .single()
      if (!error && data) {
        setForm(prev => ({
          ...prev,
          business_name: data.business_name && data.business_name !== 'Mi Negocio' ? data.business_name : '',
          business_phone: data.business_phone || '',
          country: data.country || 'República Dominicana',
          currency: data.currency || 'DOP',
          timezone: data.timezone || 'GMT-4',
        }))
      }
      setLoading(false)
    })()
  }, [supabase])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      business_name: form.business_name,
      business_phone: form.business_phone,
      country: form.country,
      currency: form.currency,
      timezone: form.timezone,
      onboarding_completed: true,
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Debes iniciar sesión.')
      setSaving(false)
      return
    }

    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .single()

    let error: { message: string } | null = null
    if (existing) {
      const res = await supabase
        .from('settings')
        .update(payload)
        .eq('id', existing.id)
        .eq('user_id', user.id)
      error = res.error
    } else {
      const res = await supabase
        .from('settings')
        .insert({ ...payload, user_id: user.id })
      error = res.error
    }

    setSaving(false)
    if (error) {
      setError('Error al guardar: ' + error.message)
      return
    }

    setSubmitted(true)
    setTimeout(() => router.replace('/dashboard'), 1200)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-foreground">¡Listo!</h1>
          <p className="text-muted-foreground">Tu negocio quedó configurado. Te llevamos a tu panel...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-primary-light/20 to-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src="/gp-icon.png" alt="GP" className="w-16 h-16 rounded-xl mx-auto object-cover" />
          <h1 className="text-2xl font-bold text-foreground mt-3">Bienvenido</h1>
          <p className="text-muted-foreground mt-1">Configuremos tu negocio</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}

          <Input
            label="Nombre del negocio"
            required
            value={form.business_name}
            onChange={e => update('business_name', e.target.value)}
            placeholder="Mi Negocio"
          />

          <Input
            label="Teléfono"
            value={form.business_phone}
            onChange={e => update('business_phone', e.target.value)}
            placeholder="809-555-1234"
          />

          <Select
            label="País"
            value={form.country}
            onChange={e => update('country', e.target.value)}
            options={COUNTRIES}
          />

          <Select
            label="Zona horaria"
            value={form.timezone}
            onChange={e => update('timezone', e.target.value)}
            options={TIMEZONES.map(t => ({ value: t, label: t }))}
          />

          <Button type="submit" loading={saving} className="w-full">
            Continuar
          </Button>
        </form>
      </div>
    </div>
  )
}