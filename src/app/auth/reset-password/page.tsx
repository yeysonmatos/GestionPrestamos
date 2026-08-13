'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { createClient } from '@/lib/supabase-client'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const [seed, setSeed] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSeed(data.session?.access_token || '')
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      setLoading(false)
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else {
      setDone(true)
      setTimeout(() => window.location.href = '/dashboard', 1200)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src="/gp-icon.png" alt="GP" className="w-16 h-16 rounded-xl mx-auto object-cover" />
          <h1 className="text-2xl font-bold text-foreground mt-3">Nueva contraseña</h1>
          <p className="text-muted-foreground mt-1">Elige una nueva contraseña para tu cuenta</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}
          {done && <Alert variant="success">
            Contraseña actualizada. Redirigiendo...
          </Alert>}
          {!seed && !done && (
            <Alert variant="warning">
              Sesión no detectada. Vuelve a iniciar sesión y usa el enlace de recuperación.
            </Alert>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-muted-foreground mb-1">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                id="password"
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
            <label htmlFor="confirm" className="block text-sm font-medium text-muted-foreground mb-1">
              Confirmar contraseña
            </label>
            <div className="relative">
              <input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="block w-full min-w-0 rounded-lg border px-3 py-2 pr-10 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary bg-card min-h-11 border-border"
                placeholder="Repite la contraseña"
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

          <Button type="submit" loading={loading} disabled={!seed} className="w-full">
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">
              Volver a iniciar sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}