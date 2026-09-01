'use client'

import { Card } from '@/components/ui/Card'
import { ShieldWarning } from '@phosphor-icons/react'

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-warning-light flex items-center justify-center mx-auto">
          <ShieldWarning className="h-8 w-8 text-warning" weight="fill" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Tu cuenta fue suspendida</h1>
        <p className="text-sm text-muted-foreground">
          Tu cuenta fue bloqueada por el administrador de Gestor de Prestamos.
          Si crees que se trata de un error, contacta al administrador.
        </p>
      </Card>
    </div>
  )
}