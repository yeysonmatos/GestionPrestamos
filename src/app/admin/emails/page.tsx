import PageHeader from '@/components/ui/PageHeader'
import AdminEmails from './AdminEmails'

export const dynamic = 'force-dynamic'

export default function AdminEmailsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Correos"
        description="Cola e historial de notificaciones enviadas por SMTP"
      />
      <AdminEmails />
    </div>
  )
}