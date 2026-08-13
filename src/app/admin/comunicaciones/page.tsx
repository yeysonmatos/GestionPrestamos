import PageHeader from '@/components/ui/PageHeader'
import ComunicacionesTabs from './ComunicacionesTabs'

export const dynamic = 'force-dynamic'

export default function AdminComunicacionesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunicaciones"
        description="Notificaciones por correo: historial, avisos de renovación y configuración SMTP"
      />
      <ComunicacionesTabs />
    </div>
  )
}