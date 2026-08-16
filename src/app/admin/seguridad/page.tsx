import { Card } from '@/components/ui/Card'
import MfaSetup from '@/components/auth/MfaSetup'

export const dynamic = 'force-dynamic'

export default function AdminSecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Seguridad</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Protege tu cuenta de administrador con doble verificación.
        </p>
      </div>

      <Card>
        <MfaSetup />
      </Card>
    </div>
  )
}