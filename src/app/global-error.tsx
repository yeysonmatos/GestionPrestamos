'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="es">
      <body>
        <main className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center text-2xl">⚠️</div>
            <h1 className="text-xl font-bold">Ocurrió un error inesperado</h1>
            <p className="text-sm text-muted-foreground">
              No pudimos cargar esta parte de la aplicación. Si el problema persiste, contacta al administrador.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={reset}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium"
              >
                Reintentar
              </button>
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium"
              >
                Ir al inicio
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}