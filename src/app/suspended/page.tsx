'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ShieldWarning, CircleNotch } from '@phosphor-icons/react'

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-warning-light flex items-center justify-center mx-auto">
          <ShieldWarning className="h-8 w-8 text-warning" weight="fill" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Tu suscripción venció</h1>
        <p className="text-sm text-muted-foreground">
          Según las políticas del plan, al vencer tus datos pasan a modo de solo lectura.
          Elige un plan para seguir usando todas las funciones de Gestor de Prestamos.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <Link href="/pricing">
            <Button className="w-full">
              <CircleNotch className="h-4 w-4 mr-1" /> Ver planes disponibles
            </Button>
          </Link>
          <Link href="/account">
            <Button variant="secondary" className="w-full">Ir a Mi plan</Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}