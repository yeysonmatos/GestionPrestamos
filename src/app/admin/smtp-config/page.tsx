import PageHeader from '@/components/ui/PageHeader'
import AdminSmtpConfig from './AdminSmtpConfig'

export const dynamic = 'force-dynamic'

export default function AdminSmtpConfigPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración SMTP"
        description="Servidor de correo usado para enviar las notificaciones"
      />
      <AdminSmtpConfig />
    </div>
  )
}