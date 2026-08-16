'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[error]', error)
  }, [error])

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="max-w-md w-full text-center space-y-4 p-6">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center text-2xl">⚠️</div>
        <h1 className="text-xl font-bold">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar esta página. Inténtalo de nuevo.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}