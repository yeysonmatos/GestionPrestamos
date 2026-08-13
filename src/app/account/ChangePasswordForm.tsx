'use client'

import { useState } from 'react'
import { Eye, EyeSlash, Key } from '@phosphor-icons/react'
import { createClient } from '@/lib/supabase-client'
import Button from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import Input from '@/components/ui/Input'

export default function ChangePasswordForm() {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (password.length < 6) {
      setError('La contraseña nueva debe tener al menos 6 caracteres.')
      setLoading(false)
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setError('No se pudo identificar tu cuenta.')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    })
    if (signInError) {
      setError('La contraseña actual es incorrecta.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else {
      setMessage('Contraseña actualizada correctamente.')
      setCurrent('')
      setPassword('')
      setConfirm('')
    }
  }

  return (
    <div className="p-6">
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
        <Key className="h-5 w-5 text-primary" />
        Cambiar contraseña
      </h3>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {message && <Alert variant="success">{message}</Alert>}

        <Input label="Contraseña actual" type="password" required value={current} onChange={e => setCurrent(e.target.value)} placeholder="Tu contraseña actual" />

        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-muted-foreground mb-1">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="block w-full min-w-0 rounded-lg border px-3 py-2 pr-10 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11 border-border"
              placeholder="Mínimo 6 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeSlash className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-muted-foreground mb-1">
            Confirmar nueva contraseña
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="block w-full min-w-0 rounded-lg border px-3 py-2 pr-10 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11 border-border"
              placeholder="Repite la nueva contraseña"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeSlash className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <Button type="submit" loading={loading}>
          Guardar contraseña
        </Button>
      </form>
    </div>
  )
}