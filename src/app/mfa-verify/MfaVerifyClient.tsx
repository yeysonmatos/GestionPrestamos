'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ShieldCheck } from '@phosphor-icons/react'
import { createClient } from '@/lib/supabase-client'
import { Alert } from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function MfaVerifyClient() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [hasMfa, setHasMfa] = useState(false)

  const check = useCallback(async () => {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === 'aal2') {
        window.location.href = next || '/dashboard'
        return
      }
      const needs = aal?.nextLevel === 'aal2'
      setHasMfa(needs)
      if (!needs) window.location.href = '/login'
    } catch {
      window.location.href = '/login'
    }
    setLoading(false)
  }, [supabase, next])

  useEffect(() => { check() }, [check])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim().length < 6) {
      setError('Ingresa el código de 6 dígitos de tu autenticador.')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const totpFactor = (factorsData?.all || []).find(f => f.factor_type === 'totp' && f.status === 'verified')
      if (!totpFactor) throw new Error('No hay un autenticador verificado en esta cuenta.')

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: totpFactor.id,
        code: code.trim(),
      })
      if (verifyError) throw new Error(verifyError.message)

      window.location.href = next || '/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'El código no es válido o expiró.')
    }
    setVerifying(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center px-4 bg-background">
    <p className="text-sm text-muted-foreground">Verificando...</p>
  </div>

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-9 w-9 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground mt-3">Verificación en dos pasos</h1>
          <p className="text-muted-foreground mt-1 text-sm">Confirma tu identidad para continuar</p>
        </div>

        <form onSubmit={handleVerify} className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}

          {hasMfa ? (
            <>
              <p className="text-sm text-muted-foreground">
                Ingresa el código de 6 dígitos de tu app de autenticación (Google Authenticator, Authy, etc.).
              </p>
              <Input
                label="Código de autenticación"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
              />
              <Button type="submit" loading={verifying} className="w-full">
                Verificar
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No se pudo verificar tu identidad.{' '}
              <Link href="/login" className="text-primary hover:underline">
                Inicia sesión de nuevo
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}