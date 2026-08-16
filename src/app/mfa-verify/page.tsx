import { Suspense } from 'react'
import MfaVerifyClient from './MfaVerifyClient'

export default function MfaVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <p className="text-sm text-muted-foreground">Verificando...</p>
    </div>}>
      <MfaVerifyClient />
    </Suspense>
  )
}